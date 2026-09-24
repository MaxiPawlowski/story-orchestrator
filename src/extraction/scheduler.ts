import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import type { ParsedArcSignal, ParsedEpistemicSignal, ParsedLedgerSignal, ParsedMemoryLine } from "@memory/index";
import type { ExtraGateSource, TypedJudge } from "./types";
import { getChatWindow } from "./chatWindow";
import { isLapse } from "./client";
import { runSharedRead, sharedReadWindow } from "./sharedRead";
import type { ParsedFact, SharedReadAudit, SharedReadWindow } from "./types";

export interface SchedulerSettings {
  enabled: boolean;
  profileId: string | null;
  cadence: number;
  reconciliationMultiplier: number;
  stabilityLag: number;
  debugResponse?: string | null;
  pressureThreshold?: number;
}

export const PRESSURE_DEFAULT_THRESHOLD = 3;

export interface NextReadWindow {
  source: "queued" | "cadence";
  reason: string;
  window: SharedReadWindow;
}

export interface ReadOwnership {
  stillOwns(): boolean;
  lapsedDetail(): string | null;
  signal?: AbortSignal;
  release?(): void;
}

export interface SchedulerJob {
  priority: 0 | 1 | 2 | 3 | 4;
  reason: string;
  window?: SharedReadWindow;
  run?: () => Promise<void>;
}

export interface SchedulerHost {
  getStory(): NormalizedStoryV2 | null;
  getEngineState(): EngineState | null;
  getExtractionSettings(): SchedulerSettings;
  getFacts(): ParsedFact[];
  getFiredTransitions(): NormalizedTransition[];
  getExpansionGateSources(): ExtraGateSource[];
  getOpenArcs(): string[];
  getEpistemicLedgerCapable?(): boolean;
  getEntities?(): string[];
  judgeTyped?(): TypedJudge | null;
  applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[], memory: ParsedMemoryLine[], arcs: ParsedArcSignal[], epistemic?: ParsedEpistemicSignal[], ledger?: ParsedLedgerSignal[], read?: ReadOwnership | null): Promise<void>;
  beginRead?(window: { from: number; to: number }): ReadOwnership;
  onSchedulerChange(): void;
  pauseExtraction(message: string): void;
  noteLapse?(reason: string, detail: string): void;
  /**
   * v2.3 plan 03 §Abort and cleanup: which world this work belongs to. A job that fails after its
   * world ended must not pause extraction for the world that replaced it — pausing is install-wide.
   */
  epoch?: () => number;
}

// V25 (found live by V13, 2026-09-23). Cadence counts BOUNDARIES, and the window used to count
// MESSAGES: `cadence` of them ending at the stable end. At cadence 1 a read saw only the newest reply,
// never the player's line before it; in a group, several replies per line pushed the player's own
// words out of every window; in a solo chat at cadence 3, half the transcript was never read. A
// cadence read now starts where the previous one ended. With no cursor (the first read, a new world,
// or a chat a rollback made shorter than the cursor) it reads the same span the default shared read
// does, and no read spans more than CADENCE_WINDOW_MAX messages, so a long pause cannot send the
// whole chat as one prompt.
export const CADENCE_WINDOW_FALLBACK = 8;
export const CADENCE_WINDOW_MAX = 24;

export const cadenceWindowFrom = (cursor: number | null, stableTo: number): number => {
  const from = cursor !== null && cursor < stableTo ? cursor + 1 : stableTo - CADENCE_WINDOW_FALLBACK + 1;
  return Math.max(0, from, stableTo - CADENCE_WINDOW_MAX + 1);
};

export class ExtractionScheduler {
  private readonly queue: SchedulerJob[] = [];
  private readonly heavyQueue: SchedulerJob[] = [];
  private inFlight = false;
  private heavyInFlight = false;
  private lastError: string | null = null;
  private lastHeavyError: string | null = null;
  private cadenceBoundary = -1;
  private cadenceTo: number | null = null;

  constructor(private readonly host: SchedulerHost) {}

  /**
   * v2.3 plan 03: everything queued belonged to a world that no longer exists — a story load,
   * select, restart, clear, or a chat change.
   *
   * The ownership tokens already stop these jobs *writing* anything. This stops them *running*:
   * otherwise each one still builds a prompt from the new chat's window and spends a model call to
   * produce a result that is then discarded.
   *
   * It does not touch `inFlight`: clearing the flag would let a second job start beside the one
   * still awaiting the model. That one is aborted by the epoch change (v2.4 plan 03 D2), and refused
   * at the write edge if its answer wins the race against the abort.
   */
  clearForNewWorld() {
    this.queue.length = 0;
    this.heavyQueue.length = 0;
    // Boundary numbers restart with a new story, so a carried-over cursor makes the new world look
    // as though its cadence read had already happened.
    this.cadenceBoundary = -1;
    this.cadenceTo = null;
    this.lastError = null;
    this.lastHeavyError = null;
    this.host.onSchedulerChange();
  }

  private sameWorld(startedEpoch: number): boolean {
    return (this.host.epoch?.() ?? 0) === startedEpoch;
  }

  private underPressure(): boolean {
    const threshold = this.host.getExtractionSettings().pressureThreshold ?? PRESSURE_DEFAULT_THRESHOLD;
    return this.queue.length >= threshold;
  }

  schedule(job: SchedulerJob) {
    if (job.priority >= 3) {
      this.heavyQueue.push(job);
      this.heavyQueue.sort((left, right) => left.priority - right.priority);
      this.host.onSchedulerChange();
      void this.pumpHeavy();
      return;
    }
    if (job.priority === 2 && this.underPressure()) {
      for (let index = this.queue.length - 1; index >= 0; index -= 1) {
        if (this.queue[index].priority === 2) this.queue.splice(index, 1);
      }
    }
    if (job.priority === 1) {
      const existing = this.queue.find((entry) => entry.priority === 1);
      if (existing) {
        const left = existing.window ?? job.window;
        const right = job.window ?? existing.window;
        if (left && right) existing.window = getChatWindow(Math.min(left.from, right.from), Math.max(left.to, right.to));
        return;
      }
    }
    this.queue.push(job);
    this.queue.sort((left, right) => left.priority - right.priority);
    this.host.onSchedulerChange();
    void this.pump();
  }

  // v2.2 plan 06: this boundary already queued a cadence read, which carries the judged step itself.
  cadenceQueuedAt(boundary: number): boolean {
    return this.cadenceBoundary === boundary;
  }

  onBoundary(boundary: number, fired: boolean, lastMessageId: number) {
    const settings = this.host.getExtractionSettings();
    if (!settings.enabled || settings.cadence <= 0) return;
    if (!fired && boundary > 0 && boundary % settings.cadence === 0 && !this.underPressure()) {
      const stableTo = lastMessageId - Math.max(0, settings.stabilityLag ?? 1);
      if (stableTo >= 0) {
        this.cadenceBoundary = boundary;
        this.schedule({ priority: 1, reason: "cadence", window: getChatWindow(cadenceWindowFrom(this.cadenceTo, stableTo), stableTo) });
        this.cadenceTo = stableTo;
      }
    }
    void this.pumpHeavy();
  }

  nextReadWindow(lastMessageId: number): NextReadWindow | null {
    const queued = this.queue.find((job) => job.window);
    if (queued?.window) return { source: "queued", reason: queued.reason, window: queued.window };
    const stableTo = lastMessageId - Math.max(0, this.host.getExtractionSettings().stabilityLag ?? 1);
    if (stableTo < 0) return null;
    return { source: "cadence", reason: "cadence", window: getChatWindow(cadenceWindowFrom(this.cadenceTo, stableTo), stableTo) };
  }

  getSnapshot() {
    return { queueDepth: this.queue.length, inFlight: this.inFlight, lastError: this.lastError, heavyQueueDepth: this.heavyQueue.length, heavyInFlight: this.heavyInFlight, lastHeavyError: this.lastHeavyError };
  }

  private async pump() {
    if (this.inFlight) return;
    const job = this.queue.shift();
    if (!job) return;
    // The world this job belongs to, read before it runs (v2.3 plan 03 §Abort and cleanup).
    const startedEpoch = this.host.epoch?.() ?? 0;
    const story = this.host.getStory();
    const state = this.host.getEngineState();
    const settings = this.host.getExtractionSettings();
    if (!story || !state || !settings.enabled) {
      this.host.onSchedulerChange();
      return;
    }
    this.inFlight = true;
    this.host.onSchedulerChange();
    let read: ReadOwnership | null = null;
    try {
      if (job.run) {
        await this.runWithRetries(job.run);
      } else {
        const priority = job.priority === 0 ? 0 : 1;
        const window = sharedReadWindow({ state, priority, window: job.window && getChatWindow(job.window.from, job.window.to), stabilityLag: settings.stabilityLag });
        read = this.host.beginRead?.({ from: window.from, to: window.to }) ?? null;
        const client = read?.signal ? { ...settings, signal: read.signal } : settings;
        const result = await this.runWithRetries(() => runSharedRead({ story, state, priority, reason: job.reason, window, stabilityLag: settings.stabilityLag, firedTransitions: this.host.getFiredTransitions(), facts: this.host.getFacts(), extraGateSources: this.host.getExpansionGateSources(), openArcs: this.host.getOpenArcs(), epistemicLedgerCapable: this.host.getEpistemicLedgerCapable?.() ?? false, entities: this.host.getEntities?.() ?? [], judgeTyped: this.host.judgeTyped?.() ?? null, client }));
        await this.host.applyExtractionAudit(result.audit, result.facts, result.memory, result.arcs, result.epistemic, result.ledger, read);
      }
      if (this.sameWorld(startedEpoch)) this.lastError = null;
    } catch (error) {
      if (isLapse(error)) {
        if (this.sameWorld(startedEpoch)) this.noteLapse(job, error);
        return;
      }
      // Pausing is INSTALL-WIDE, so a job that failed after its world ended must not pause the
      // world that replaced it: switching chats would otherwise inherit the previous story's dead
      // backend and silently stop extracting everywhere. Nor may it put its error in the new
      // world's panel, which `clearForNewWorld` had just emptied (V3).
      if (this.sameWorld(startedEpoch)) {
        this.lastError = error instanceof Error ? error.message : "Extraction failed";
        this.host.pauseExtraction(this.lastError);
      }
    } finally {
      read?.release?.();
      this.inFlight = false;
      this.host.onSchedulerChange();
      void this.pump();
      void this.pumpHeavy();
    }
  }

  private async pumpHeavy() {
    if (this.heavyInFlight) return;
    const next = this.heavyQueue[0];
    if (!next) return;
    if (next.priority === 4 && this.underPressure()) return;
    const job = this.heavyQueue.shift();
    if (!job) return;
    if (!job.run) return;
    const startedEpoch = this.host.epoch?.() ?? 0;
    this.heavyInFlight = true;
    this.host.onSchedulerChange();
    try {
      await this.runWithRetries(job.run);
      if (this.sameWorld(startedEpoch)) this.lastHeavyError = null;
    } catch (error) {
      if (isLapse(error)) {
        if (this.sameWorld(startedEpoch)) this.noteLapse(job, error);
        return;
      }
      if (this.sameWorld(startedEpoch)) this.lastHeavyError = error instanceof Error ? error.message : "Background generation failed";
    } finally {
      this.heavyInFlight = false;
      this.host.onSchedulerChange();
      void this.pumpHeavy();
    }
  }

  private noteLapse(job: SchedulerJob, error: unknown) {
    this.host.noteLapse?.(`extraction read lapsed: ${job.reason}`, error instanceof Error ? error.message : String(error));
  }

  private async runWithRetries<T>(task: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        if (isLapse(error)) throw error;
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => globalThis.setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}

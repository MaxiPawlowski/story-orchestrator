import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import type { ParsedArcSignal, ParsedEpistemicSignal, ParsedLedgerSignal, ParsedMemoryLine } from "@memory/index";
import type { ExtraGateSource, TypedJudge } from "./types";
import { getChatWindow } from "./chatWindow";
import { runSharedRead } from "./sharedRead";
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
  applyExtractionAudit(audit: SharedReadAudit, facts: ParsedFact[], memory: ParsedMemoryLine[], arcs: ParsedArcSignal[], epistemic?: ParsedEpistemicSignal[], ledger?: ParsedLedgerSignal[]): Promise<void>;
  onSchedulerChange(): void;
  pauseExtraction(message: string): void;
  /**
   * v2.3 plan 03 §Abort and cleanup: which world this work belongs to. A job that fails after its
   * world ended must not pause extraction for the world that replaced it — pausing is install-wide.
   */
  epoch?: () => number;
}

export class ExtractionScheduler {
  private readonly queue: SchedulerJob[] = [];
  private readonly heavyQueue: SchedulerJob[] = [];
  private inFlight = false;
  private heavyInFlight = false;
  private lastError: string | null = null;
  private lastHeavyError: string | null = null;
  private cadenceBoundary = -1;

  constructor(private readonly host: SchedulerHost) {}

  /**
   * v2.3 plan 03: everything queued belonged to a world that no longer exists — a story load,
   * select, restart, clear, or a chat change.
   *
   * The ownership tokens already stop these jobs *writing* anything. This stops them *running*:
   * otherwise each one still builds a prompt from the new chat's window and spends a model call to
   * produce a result that is then discarded.
   *
   * It does not touch `inFlight`. A job that is already awaiting the model cannot be recalled by
   * setting a flag, and clearing the flag would let a second job start beside it; the in-flight one
   * finishes and its result is refused at the write edge, which is what the tokens are for.
   */
  clearForNewWorld() {
    this.queue.length = 0;
    this.heavyQueue.length = 0;
    // Boundary numbers restart with a new story, so a carried-over cursor makes the new world look
    // as though its cadence read had already happened.
    this.cadenceBoundary = -1;
    this.lastError = null;
    this.lastHeavyError = null;
    this.host.onSchedulerChange();
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
        this.schedule({ priority: 1, reason: "cadence", window: getChatWindow(Math.max(0, stableTo - settings.cadence + 1), stableTo) });
      }
    }
    void this.pumpHeavy();
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
    try {
      if (job.run) {
        await this.runWithRetries(job.run);
      } else {
        const priority = job.priority === 0 ? 0 : 1;
        const result = await this.runWithRetries(() => runSharedRead({ story, state, priority, reason: job.reason, window: job.window, stabilityLag: settings.stabilityLag, firedTransitions: this.host.getFiredTransitions(), facts: this.host.getFacts(), extraGateSources: this.host.getExpansionGateSources(), openArcs: this.host.getOpenArcs(), epistemicLedgerCapable: this.host.getEpistemicLedgerCapable?.() ?? false, entities: this.host.getEntities?.() ?? [], judgeTyped: this.host.judgeTyped?.() ?? null, client: settings }));
        await this.host.applyExtractionAudit(result.audit, result.facts, result.memory, result.arcs, result.epistemic, result.ledger);
      }
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Extraction failed";
      // Pausing is INSTALL-WIDE, so a job that failed after its world ended must not pause the
      // world that replaced it: switching chats would otherwise inherit the previous story's dead
      // backend and silently stop extracting everywhere. The error is still recorded for the panel.
      if ((this.host.epoch?.() ?? 0) === startedEpoch) this.host.pauseExtraction(this.lastError);
    } finally {
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
    this.heavyInFlight = true;
    this.host.onSchedulerChange();
    try {
      await this.runWithRetries(job.run);
      this.lastHeavyError = null;
    } catch (error) {
      this.lastHeavyError = error instanceof Error ? error.message : "Background generation failed";
    } finally {
      this.heavyInFlight = false;
      this.host.onSchedulerChange();
      void this.pumpHeavy();
    }
  }

  private async runWithRetries<T>(task: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => globalThis.setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}

import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import type { ParsedArcSignal, ParsedEpistemicSignal, ParsedLedgerSignal, ParsedMemoryLine } from "@memory/index";
import type { ExtraGateSource, TypedJudge } from "./types";
import { getChatWindow } from "./chatWindow";
import { isCueReason, mergeCueReasons } from "./cues";
import { Breaker, DANGLING_PROFILE_DETAIL, failedProfile, failedRetryAt, failureClass, probeTimeoutMs } from "./breaker";
import type { ExtractionHealth, ProbeResult, ProbeTrigger } from "./breaker";
import { Failover, recovered, transportHealth, tripped } from "./failover";
import { isLapse } from "./modelError";
import { isHarnessKey } from "@utils/harness";
import type { ModelCall } from "./modelRoute";
import { runSharedRead, sharedReadWindow } from "./sharedRead";
import { ROLLBACK_REREAD_PREFIX, rollbackRereadReason } from "./rereadReason";
import { CADENCE_WINDOW_FALLBACK, CADENCE_WINDOW_MAX, cadenceWindowFrom } from "./cadenceWindow";
import type { RequestBudget } from "./tokenMeter";
import type { ParsedFact, SharedReadAudit, SharedReadWindow } from "./types";

export interface SchedulerSettings {
  enabled: boolean;
  profileId: string | null;
  fallbackProfileId?: string | null;
  cadence: number;
  stabilityLag: number;
  pressureThreshold?: number;
  budget?: RequestBudget;
}

export const PRESSURE_DEFAULT_THRESHOLD = 3;

export interface NextReadWindow {
  source: "queued" | "cadence";
  reason: string;
  window: SharedReadWindow;
}

export interface ReadOwnership {
  stillOwns(): boolean;
  lapsed?(): string | null;
  lapsedDetail(): string | null;
  signal?: AbortSignal;
  release?(): void;
}

interface LapsedRead {
  ownership: ReadOwnership;
  window: { from: number; to: number };
}

export interface SchedulerJob {
  priority: 0 | 1 | 2 | 3 | 4;
  reason: string;
  window?: SharedReadWindow;
  run?: () => Promise<void>;
  heldOn?: string;
}

export interface SchedulerHost {
  getStory(): NormalizedStoryV2 | null;
  getEngineState(): EngineState | null;
  getExtractionSettings(): SchedulerSettings;
  model: ModelCall;
  getFacts(): ParsedFact[];
  getFiredTransitions(): NormalizedTransition[];
  getExpansionGateSources(): ExtraGateSource[];
  cardScope?(): { owners: string[]; cursor: number };
  getOpenArcs(): string[];
  getEpistemicLedgerCapable?(): boolean;
  getEntities?(): string[];
  judgeTyped?(): TypedJudge | null;
  applyExtractionAudit(
    audit: SharedReadAudit,
    facts: ParsedFact[],
    memory: ParsedMemoryLine[],
    arcs: ParsedArcSignal[],
    epistemic?: ParsedEpistemicSignal[],
    ledger?: ParsedLedgerSignal[],
    read?: ReadOwnership | null,
  ): Promise<void>;
  beginRead?(window: { from: number; to: number }): ReadOwnership;
  readsOpenChat?(): boolean;
  onSchedulerChange(): void;
  noteLapse?(reason: string, detail: string): void;
  noteHealth?(summary: string, detail: string): void;
  probeModel?(profileId: string, timeoutMs?: number): Promise<ProbeResult>;
  mutationSettled?(): Promise<unknown>;
  profileExists?(profileId: string): boolean;
  profileName?(profileId: string): string;
  /** The route key the background lane's passes go to (synthesis); unset = the read route. */
  heavyRouteKey?(): string | null;
  epoch?: () => number;
  /** True while a multi-voice turn is running and its checkpoint asked extraction to wait for it. */
  holdCadence?(): boolean;
  readCursorSeed?(): number | null;
}

export const ANSWERED_SAMPLES = 8;

export const REREAD_LAPSED_REASON = "reread:lapsed";
export const RESUME_DROPPED_REASON = "resume:dropped";
export { CADENCE_WINDOW_FALLBACK, CADENCE_WINDOW_MAX, cadenceWindowFrom, ROLLBACK_REREAD_PREFIX, rollbackRereadReason };
export const REREAD_SETTLE_MAX_MS = 10_000;

const overlaps = (left: { from: number; to: number }, right: { from: number; to: number }) => left.from <= right.to && right.from <= left.to;

const isWindowlessCue = (job: SchedulerJob) => job.priority === 0 && !job.run && !job.window && isCueReason(job.reason);

const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

export class ExtractionScheduler {
  private readonly queue: SchedulerJob[] = [];
  private readonly breaker = new Breaker();
  private readonly probeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly probing = new Map<string, Promise<boolean>>();
  private readonly answered = new Map<string, number[]>();
  private readonly failover = new Failover({
    isOpen: (id) => this.breaker.isOpen(id), usable: (id) => !this.profileProblems.has(id) && !this.dangling(id),
    fallbackId: () => this.host.getExtractionSettings().fallbackProfileId ?? null, name: (id) => this.host.profileName?.(id) ?? id,
    trip: (id, detail) => { this.trip(id, detail); this.host.onSchedulerChange(); },
  });
  readonly gate = this.failover.gate;
  private configProblem: string | null = null;
  private readonly profileProblems = new Map<string, string>();
  private readonly heavyQueue: SchedulerJob[] = [];
  private inFlight = false;
  private running: SchedulerJob | null = null;
  private heavyInFlight = false;
  private lastError: string | null = null;
  private lastHeavyError: string | null = null;
  private cadenceBoundary = -1;
  private cadenceTo: number | null = null;
  private settling: Promise<void> | null = null;

  constructor(private readonly host: SchedulerHost) {}

  /**
   * Everything queued belonged to a world that no longer exists — a story load,
   * select, restart, clear, or a chat change.
   *
   * The ownership tokens already stop these jobs *writing* anything. This stops them *running*:
   * otherwise each one still builds a prompt from the new chat's window and spends a model call to
   * produce a result that is then discarded.
   *
   * It does not touch `inFlight`: clearing the flag would let a second job start beside the one
   * still awaiting the model. That one is aborted by the epoch change, and refused
   * at the write edge if its answer wins the race against the abort.
   */
  clearForNewWorld() {
    this.queue.length = 0;
    this.heavyQueue.length = 0;
    // Boundary numbers restart with a new story, so a carried-over cursor makes the new world look
    // as though its cadence read had already happened.
    this.cadenceBoundary = -1;
    this.cadenceTo = null;
    this.settling = null;
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
    if (this.mergeRead(job) || this.mergeReread(job) || this.mergeCue(job)) return;
    this.queue.push(job);
    this.queue.sort((left, right) => left.priority - right.priority);
    this.host.onSchedulerChange();
    void this.pump();
  }

  private mergeRead(job: SchedulerJob): boolean {
    if (job.priority !== 1) return false;
    const existing = this.queue.find((entry) => entry.priority === 1);
    if (!existing) return false;
    const left = existing.window ?? job.window;
    const right = job.window ?? existing.window;
    if (left && right) {
      const to = Math.max(left.to, right.to);
      existing.window = getChatWindow(Math.max(Math.min(left.from, right.from), to - CADENCE_WINDOW_MAX + 1), to);
    }
    return true;
  }

  private mergeCue(job: SchedulerJob): boolean {
    if (!isWindowlessCue(job)) return false;
    const existing = this.queue.find(isWindowlessCue);
    if (!existing) return false;
    existing.reason = mergeCueReasons(existing.reason, job.reason);
    this.host.onSchedulerChange();
    return true;
  }

  private mergeReread(job: SchedulerJob): boolean {
    const incoming = job.window;
    if (job.priority !== 0 || !incoming) return false;
    const existing = this.queue.find((entry) => entry.priority === 0 && entry.window && overlaps(
      entry.window,
      incoming,
    ) && (entry.reason === REREAD_LAPSED_REASON || job.reason === REREAD_LAPSED_REASON));
    if (!existing?.window) return false;
    existing.window = getChatWindow(Math.min(existing.window.from, incoming.from), Math.max(existing.window.to, incoming.to));
    if (existing.reason === REREAD_LAPSED_REASON) existing.reason = job.reason;
    this.host.onSchedulerChange();
    return true;
  }

  private rereadAfterMutation(window: { from: number; to: number }, startedEpoch: number) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bound = new Promise<void>((resolve) => { timer = globalThis.setTimeout(resolve, REREAD_SETTLE_MAX_MS); });
    const settling = Promise.race([Promise.resolve(this.host.mutationSettled?.()).catch(() => undefined), bound]).then(() => {
      if (timer !== null) globalThis.clearTimeout(timer);
      if (this.settling === settling) this.settling = null;
      if (!this.sameWorld(startedEpoch)) return;
      const next = getChatWindow(window.from, window.to);
      if (next.to >= next.from) this.schedule({ priority: 0, reason: REREAD_LAPSED_REASON, window: next });
      void this.pump();
    });
    this.settling = settling;
  }

  private hold(job: SchedulerJob) {
    if (this.mergeRead(job)) return;
    this.queue.unshift(job);
    this.queue.sort((left, right) => left.priority - right.priority);
  }

  private readProfile(): string | null {
    return this.host.getExtractionSettings().profileId;
  }

  breakerOpen(profileId: string | null = this.readProfile()): boolean {
    return Boolean(profileId && this.breaker.isOpen(profileId) && !this.failover.fallbackFor(profileId));
  }

  /** A routed profile's own reading, for its Repair row. */
  profileHealth(profileId: string): ExtractionHealth | null {
    if (profileId === this.readProfile() && this.configProblem) return { kind: "config", detail: this.configProblem };
    const problem = this.profileProblems.get(profileId);
    if (problem) return { kind: "config", detail: problem };
    return transportHealth(this.breaker.entry(profileId), this.failover.name(profileId));
  }

  private runnable(queue: SchedulerJob[]): number {
    return queue.findIndex((job) => !job.heldOn || !this.breakerOpen(job.heldOn));
  }

  health(): ExtractionHealth | null {
    if (this.configProblem) return { kind: "config", detail: this.configProblem };
    const profileId = this.host.getExtractionSettings().profileId;
    return transportHealth(profileId ? this.breaker.entry(profileId) : null, this.failover.name(profileId));
  }

  private dangling(profileId: string | null): boolean {
    return Boolean(profileId && !isHarnessKey(profileId) && this.host.profileExists && !this.host.profileExists(profileId));
  }

  reevaluateConfig(clearOther = true) {
    const profileId = this.host.getExtractionSettings().profileId;
    const dangling = this.dangling(profileId);
    if (dangling && profileId && this.breaker.close(profileId)) this.clearProbeTimer(profileId);
    const next = dangling ? DANGLING_PROFILE_DETAIL : clearOther || this.configProblem === DANGLING_PROFILE_DETAIL ? null : this.configProblem;
    if (next === this.configProblem) return;
    this.configProblem = next;
    this.host.onSchedulerChange();
    if (!next) this.pumpAll();
  }

  probe(trigger: ProbeTrigger, profileId: string | null = this.readProfile()): Promise<boolean> {
    if (!profileId || !this.breaker.isOpen(profileId)) {
      this.pumpAll();
      return Promise.resolve(profileId === this.readProfile() ? this.configProblem === null : !this.profileProblems.has(profileId ?? ""));
    }
    const running = this.probing.get(profileId);
    if (running) return running;
    if (!this.breaker.beginProbe(profileId)) return Promise.resolve(false);
    this.clearProbeTimer(profileId);
    this.host.onSchedulerChange();
    const probing = this.runProbe(profileId, trigger).finally(() => { this.probing.delete(profileId); });
    this.probing.set(profileId, probing);
    return probing;
  }

  noteAnswered(profileId: string, ms: number) {
    this.failover.clear(profileId);
    this.answered.set(profileId, [...(this.answered.get(profileId) ?? []), Math.max(0, ms)].slice(-ANSWERED_SAMPLES));
    if (!this.breaker.close(profileId)) return;
    this.clearProbeTimer(profileId);
    this.host.noteHealth?.(recovered(this.failover.name(profileId)), `a model call answered in ${Math.round(ms)} ms`);
    this.host.onSchedulerChange();
    this.pumpAll();
  }

  private slowestAnswered(profileId: string): number | null {
    const samples = this.answered.get(profileId);
    return samples?.length ? Math.max(...samples) : null;
  }

  private async runProbe(profileId: string, trigger: ProbeTrigger): Promise<boolean> {
    let result: ProbeResult;
    const timeoutMs = probeTimeoutMs(this.breaker.entry(profileId)?.step ?? 0, this.slowestAnswered(profileId));
    try {
      result = this.host.probeModel ? await this.host.probeModel(profileId, timeoutMs) : { ok: false, kind: "transport", message: "no probe is available" };
    } catch (error) {
      result = { ok: false, kind: "transport", message: errorText(error, "the probe failed") };
    }
    if (!this.breaker.isOpen(profileId)) return result.ok;
    if (result.ok) {
      this.breaker.close(profileId);
      this.host.noteHealth?.(recovered(this.failover.name(profileId)), `probe (${trigger}) succeeded`);
    } else if (result.kind === "config") {
      this.breaker.close(profileId);
      const detail = this.dangling(profileId) ? DANGLING_PROFILE_DETAIL : result.message ?? "the memory model profile cannot be used";
      if (profileId === this.readProfile()) this.configProblem = detail;
      else this.profileProblems.set(profileId, detail);
    } else {
      this.breaker.probeFailed(profileId, result.message ?? "the memory model did not answer", Date.now());
      this.armProbe(profileId);
    }
    this.host.onSchedulerChange();
    this.pumpAll();
    return result.ok;
  }

  private noteConfig(profileId: string | null, detail: string) {
    if (!profileId || profileId === this.readProfile()) this.configProblem = detail;
    else this.profileProblems.set(profileId, detail);
  }

  private trip(profileId: string, detail: string, holdUntil: number | null = null) {
    if (!this.breaker.trip(profileId, detail, Date.now(), holdUntil)) return;
    this.host.noteHealth?.(tripped(profileId, profileId === this.readProfile(), this.failover.name(profileId)), detail);
    this.armProbe(profileId);
  }

  private armProbe(profileId: string) {
    this.clearProbeTimer(profileId);
    const entry = this.breaker.entry(profileId);
    if (!entry) return;
    this.probeTimers.set(profileId, globalThis.setTimeout(() => {
      this.probeTimers.delete(profileId);
      void this.probe("backoff", profileId);
    }, Math.max(0, entry.nextProbeAt - Date.now())));
  }

  private clearProbeTimer(profileId: string) {
    const timer = this.probeTimers.get(profileId);
    if (timer !== undefined) globalThis.clearTimeout(timer);
    this.probeTimers.delete(profileId);
  }

  dispose() {
    for (const profileId of [...this.probeTimers.keys()]) this.clearProbeTimer(profileId);
  }

  private pumpAll() {
    void this.pump();
    void this.pumpHeavy();
  }

  private noteFailure(error: unknown, job: SchedulerJob, startedEpoch: number, heavy: boolean, read: LapsedRead | null = null) {
    const profileId = failedProfile(error) ?? this.readProfile();
    const failure = failureClass(error);
    const message = errorText(error, heavy ? "Background generation failed" : "Extraction failed");
    if (failure !== "transport" || !profileId) this.rewindCursor(job, startedEpoch);
    if (failure === "lapsed") {
      if (this.sameWorld(startedEpoch)) this.noteLapse(job, error);
      if (read) this.rereadIfMutated(read, startedEpoch);
    } else if (failure === "transport" && profileId) {
      this.trip(profileId, message, failedRetryAt(error));
      if (!this.sameWorld(startedEpoch)) return;
      const held = { ...job, heldOn: profileId };
      if (heavy) this.heavyQueue.unshift(held);
      else this.hold(held);
    } else if (failure === "config") {
      this.noteConfig(profileId, this.dangling(profileId) ? DANGLING_PROFILE_DETAIL : message);
    } else if (this.sameWorld(startedEpoch)) {
      if (heavy) this.lastHeavyError = message;
      else this.lastError = message;
      this.host.noteHealth?.(`${heavy ? "background job" : "extraction"} failed: ${job.reason}`, message);
    }
  }

  private cursor(): number | null {
    return this.cadenceTo ?? this.host.readCursorSeed?.() ?? null;
  }

  private rewindCursor(job: SchedulerJob, startedEpoch: number) {
    if (job.run || !job.window || !this.sameWorld(startedEpoch) || this.cadenceTo === null) return;
    this.cadenceTo = Math.min(this.cadenceTo, job.window.from - 1);
  }

  // This boundary already queued a cadence read, which carries the judged step itself.
  cadenceQueuedAt(boundary: number): boolean {
    return this.cadenceBoundary === boundary;
  }

  onBoundary(boundary: number, fired: boolean, lastMessageId: number) {
    this.reevaluateConfig(false);
    for (const profileId of [...this.profileProblems.keys()]) if (!this.dangling(profileId)) this.profileProblems.delete(profileId);
    if (this.lastError) {
      this.lastError = null;
      this.host.onSchedulerChange();
    }
    const settings = this.host.getExtractionSettings();
    if (!settings.enabled || settings.cadence <= 0) return;
    if (this.host.holdCadence?.()) return;
    if (!fired && boundary > 0 && boundary % settings.cadence === 0 && !this.underPressure()) {
      const stableTo = lastMessageId - Math.max(0, settings.stabilityLag ?? 1);
      if (stableTo >= 0) {
        this.cadenceBoundary = boundary;
        this.schedule({ priority: 1, reason: "cadence", window: getChatWindow(cadenceWindowFrom(this.cursor(), stableTo), stableTo) });
        this.cadenceTo = stableTo;
      }
    }
    void this.pumpHeavy();
  }

  resumeDroppedRead(droppedTo: number | null, lastMessageId: number) {
    const settings = this.host.getExtractionSettings();
    if (droppedTo === null || !settings.enabled) return;
    const stableTo = lastMessageId - Math.max(0, settings.stabilityLag ?? 1);
    if (stableTo < 0) return;
    this.schedule({ priority: 1, reason: RESUME_DROPPED_REASON, window: getChatWindow(cadenceWindowFrom(this.cursor(), stableTo), stableTo) });
    this.cadenceTo = stableTo;
  }

  nextReadWindow(lastMessageId: number): NextReadWindow | null {
    const queued = this.queue.find((job) => job.window);
    if (queued?.window) return { source: "queued", reason: queued.reason, window: queued.window };
    const stableTo = lastMessageId - Math.max(0, this.host.getExtractionSettings().stabilityLag ?? 1);
    if (stableTo < 0) return null;
    return { source: "cadence", reason: "cadence", window: getChatWindow(cadenceWindowFrom(this.cursor(), stableTo), stableTo) };
  }

  getSnapshot() {
    return {
      queueDepth: this.queue.length,
      inFlight: this.inFlight,
      lastError: this.lastError,
      rereadReason: [this.running, ...this.queue].find((job) => job?.reason.startsWith(ROLLBACK_REREAD_PREFIX))?.reason ?? null,
      heavyQueueDepth: this.heavyQueue.length,
      heavyInFlight: this.heavyInFlight,
      lastHeavyError: this.lastHeavyError,
    };
  }

  private rereadIfMutated(read: LapsedRead, startedEpoch: number) {
    if (read.ownership.lapsed?.() === "window" && this.sameWorld(startedEpoch)) this.rereadAfterMutation(read.window, startedEpoch);
  }

  private async pump() {
    if (this.inFlight || this.settling || this.breakerOpen()) return;
    const index = this.runnable(this.queue);
    if (index < 0) return;
    const [job] = this.queue.splice(index, 1);
    // The world this job belongs to, read before it runs (and cleanup).
    const startedEpoch = this.host.epoch?.() ?? 0;
    const story = this.host.getStory();
    const state = this.host.getEngineState();
    const settings = this.host.getExtractionSettings();
    if (!story || !state || !settings.enabled || (!job.run && this.host.readsOpenChat?.() === false)) {
      this.host.onSchedulerChange();
      return;
    }
    this.inFlight = true;
    this.running = job;
    this.host.onSchedulerChange();
    let read: LapsedRead | null = null;
    try {
      if (job.run) {
        await this.runWithRetries(job.run);
      } else {
        const priority = job.priority === 0 ? 0 : 1;
        const window = sharedReadWindow({ state, priority, window: job.window && getChatWindow(job.window.from, job.window.to), stabilityLag: settings.stabilityLag, readWindow: getChatWindow });
        const ownership = this.host.beginRead?.({ from: window.from, to: window.to }) ?? null;
        read = ownership ? { ownership, window: { from: window.from, to: window.to } } : null;
        const ask = { role: "read" as const, pass: "read" as const, ...(settings.budget ? { budget: settings.budget } : {}), ...(ownership?.signal ? { signal: ownership.signal } : {}) };
        const result = await this.runWithRetries(() => runSharedRead({
          story,
          state,
          priority,
          reason: job.reason,
          window,
          stabilityLag: settings.stabilityLag,
          firedTransitions: this.host.getFiredTransitions(),
          facts: this.host.getFacts(),
          extraGateSources: this.host.getExpansionGateSources(),
          cardScope: this.host.cardScope?.(),
          openArcs: this.host.getOpenArcs(),
          epistemicLedgerCapable: this.host.getEpistemicLedgerCapable?.() ?? false,
          entities: this.host.getEntities?.() ?? [],
          judgeTyped: this.host.judgeTyped?.() ?? null,
          model: this.host.model,
          ask,
        }));
        await this.host.applyExtractionAudit(result.audit, result.facts, result.memory, result.arcs, result.epistemic, result.ledger, ownership);
        if (read) this.rereadIfMutated(read, startedEpoch);
      }
      if (this.sameWorld(startedEpoch)) this.lastError = null;
      this.configProblem = null;
    } catch (error) {
      this.noteFailure(error, job, startedEpoch, false, read);
    } finally {
      read?.ownership.release?.();
      this.inFlight = false;
      this.running = null;
      this.host.onSchedulerChange();
      void this.pump();
      void this.pumpHeavy();
    }
  }

  private async pumpHeavy() {
    if (this.heavyInFlight || this.breakerOpen(this.host.heavyRouteKey?.() ?? this.readProfile())) return;
    const index = this.runnable(this.heavyQueue);
    const next = index < 0 ? undefined : this.heavyQueue[index];
    if (!next) return;
    if (next.priority === 4 && this.underPressure()) return;
    const [job] = this.heavyQueue.splice(index, 1);
    if (!job.run) return;
    const startedEpoch = this.host.epoch?.() ?? 0;
    this.heavyInFlight = true;
    this.host.onSchedulerChange();
    try {
      await this.runWithRetries(job.run);
      if (this.sameWorld(startedEpoch)) this.lastHeavyError = null;
    } catch (error) {
      this.noteFailure(error, job, startedEpoch, true);
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
        if (isLapse(error) || failureClass(error) === "config" || failureClass(error) === "exhausted") throw error;
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => globalThis.setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}

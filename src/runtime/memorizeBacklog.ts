import type { EngineState, NormalizedStoryV2, NormalizedTransition } from "@engine/index";
import { planBacklog } from "@extraction/backlogPlan";
import { isLapse, retryOnTimeout } from "@extraction/modelError";
import { preflightNeeded, withJudgeCalls } from "@extraction/preflight";
import { deriveFullScope } from "@extraction/scope";
import { runSharedRead, sharedReadOverhead } from "@extraction/sharedRead";
import { createTokenMeter } from "@extraction/tokenMeter";
import type {
  ModelAsk, ModelCall, ParsedFact, PreflightConfirm, ReadOwnership, RequestBudget, RunSharedReadOptions, SchedulerJob, SharedReadAudit,
  SharedReadWindow,
} from "@extraction/index";
import type { ParsedArcSignal, ParsedEpistemicSignal, ParsedLedgerSignal, ParsedMemoryLine } from "@memory/index";
import { anySignal } from "@utils/signals";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { ChatHost } from "./hostPorts";
import type { JudgeRuntime } from "./judge";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import { required } from "@utils/guards";
import { log } from "@utils/log";

export const BACKLOG_STOPPED_BY_EDIT = "Stopped: the chat changed while memorizing";
export const BACKLOG_STOPPED_BY_UPDATE = "Stopped: the story was updated while memorizing";
export const backlogStoppedByPlayer = (processed: number, windows: number) =>
  `Stopped after ${Math.min(processed, windows)} of ${windows} parts. What was read is kept; the whole-chat pass did not run.`;

type ApplyAudit = (
  audit: SharedReadAudit, facts: ParsedFact[], memoryLines?: ParsedMemoryLine[], arcSignals?: ParsedArcSignal[],
  epistemicSignals?: ParsedEpistemicSignal[], ledgerSignals?: ParsedLedgerSignal[], read?: ReadOwnership | null, sceneWork?: SchedulerJob[],
) => Promise<unknown>;

export interface MemorizeBacklogDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  memory: () => MemoryCoordinator;
  model: () => ModelCall;
  ownership: () => RunOwnership;
  chat: () => Pick<ChatHost, "chatRows" | "chatWindow">;
  judge: () => JudgeRuntime | null;
  firedTransitions: () => NormalizedTransition[];
  applyAudit: ApplyAudit;
  commitBoundary: () => Promise<unknown>;
  budget: () => RequestBudget;
  save: () => Promise<void>;
  setStatus: (status: string) => void;
}

export class MemorizeBacklog {
  private backlogStop: AbortController | null = null;

  constructor(private readonly deps: MemorizeBacklogDeps) {}

  // Full-scope re-read of an existing chat, window by window, then one whole-chat pass that is
  // allowed to move the blackboard. Progress is surfaced through the memory backfill state.
  // The windows are packed to the request budget (`windowSize` only caps their
  // message count), the whole-chat pass is tail-fit, and a caller that passes `confirm` is asked
  // before anything is sent when the run is large. Automatic and debug callers pass none.
  async runMemorizeBacklog(windowSize?: number, confirm?: PreflightConfirm): Promise<boolean> {
    const story = this.deps.getStory();
    const memory = this.deps.memory();
    if (!story || !memory.enabled || memory.backfill?.running || this.backlogStop) return false;
    const length = this.deps.chat().chatRows().length;
    // The backlog reads the whole chat window by window for minutes; a chat switch in between
    // used to read the NEXT chat's windows into memory this pass still believed was its own.
    const read = beginRun(this.deps.ownership(), { from: 0, to: Math.max(0, length - 1) });
    const stop = new AbortController();
    this.backlogStop = stop;
    const owned: ReadOwnership = {
      stillOwns: () => !stop.signal.aborted && read.stillOwns(),
      lapsedDetail: () => (stop.signal.aborted ? "stopped" : read.lapsedDetail()),
      signal: anySignal([stop.signal, read.signal]),
    };
    const budget = this.deps.budget();
    let windows: SharedReadWindow[] | null = null;
    let completed = false;
    let failure: string | null = null;
    try {
      const messages = this.deps.chat().chatWindow(0, length - 1).messages;
      const overhead = sharedReadOverhead(this.backlogRead(story, "memorize:window", { from: 0, to: -1, messages: [] }, { role: "read", pass: "read" }));
      const estimate = confirm ? await planBacklog(messages, overhead, { contextLimit: budget.contextLimit, meter: createTokenMeter() }, windowSize) : null;
      const preflight = estimate ? withJudgeCalls(estimate.preflight, this.deps.judge()?.active("memoryVerify") === true) : null;
      if (!read.stillOwns() || (confirm && preflight && preflightNeeded(preflight, budget.contextLimit) && !(await confirm(preflight)))) return false;
      windows = [];
      memory.setBackfill({ running: true, processed: 0, total: (estimate?.windows.length ?? 0) + 1, lastError: null, preparing: true });
      await this.deps.save();
      const plan = await planBacklog(messages, overhead, budget, windowSize);
      windows = plan.windows;
      if (owned.stillOwns()) {
        memory.setBackfill({ running: true, processed: 0, total: windows.length + 1, lastError: null });
        await this.deps.save();
      }
      completed = await this.memorizeWindows(story, windows, length, owned, budget);
    } catch (error) {
      failure = error instanceof Error ? error.message : "Memorize backlog failed";
    } finally {
      if (this.backlogStop === stop) this.backlogStop = null;
      read.release();
    }
    return windows || failure ? this.endBacklog(read, stop.signal, { completed, failure, windows: windows?.length ?? 0 }) : false;
  }

  cancelMemorizeBacklog(): boolean {
    if (!this.backlogStop || this.backlogStop.signal.aborted) return false;
    this.backlogStop.abort();
    return true;
  }

  private backlogRead(story: NormalizedStoryV2, reason: "memorize:window" | "memorize:full", window: SharedReadWindow, ask: ModelAsk): RunSharedReadOptions {
    const memory = this.deps.memory();
    const state = required(this.deps.getState(), "engine state");
    const windowed = reason === "memorize:window" ? { openArcs: memory.getOpenArcs(), epistemicLedgerCapable: memory.capable, entities: memory.getEntities() } : {};
    const scope = deriveFullScope(story, state.blackboard);
    return { story, state, priority: 0, reason, window, scope, firedTransitions: this.deps.firedTransitions(), facts: memory.getFacts(), ...windowed, model: this.deps.model(), ask };
  }

  private async memorizeWindows(story: NormalizedStoryV2, windows: SharedReadWindow[], length: number, read: ReadOwnership, budget: RequestBudget): Promise<boolean> {
    const memory = this.deps.memory();
    const client: ModelAsk = { role: "read", pass: "read", budget, signal: read.signal };
    const sceneWork: SchedulerJob[] = [];
    for (const window of windows) {
      if (!read.stillOwns()) return false;
      const result = await retryOnTimeout((timeoutScale) => runSharedRead(this.backlogRead(story, "memorize:window", window, { ...client, timeoutScale })));
      await this.deps.applyAudit({ ...result.audit, acceptedDeltas: [] }, result.facts, result.memory, result.arcs, result.epistemic, result.ledger, read, sceneWork);
      await this.runSceneWork(sceneWork, read);
      if (!read.stillOwns()) return false;
      const progress = required(memory.backfill, "memorize backfill");
      memory.setBackfill({ ...progress, processed: progress.processed + 1 });
      await this.deps.save();
    }

    if (!read.stillOwns()) return false;
    const whole = this.deps.chat().chatWindow(0, Math.max(0, length - 1));
    const fullResult = await retryOnTimeout((timeoutScale) => runSharedRead(this.backlogRead(story, "memorize:full", whole, { ...client, timeoutScale })));
    await this.deps.applyAudit(fullResult.audit, [], [], [], [], [], read, sceneWork);
    await this.runSceneWork(sceneWork, read);
    if (!read.stillOwns()) return false;
    await this.deps.commitBoundary();
    return true;
  }

  private async runSceneWork(jobs: SchedulerJob[], read: ReadOwnership) {
    for (const job of jobs.splice(0)) {
      if (!read.stillOwns()) return;
      await job.run?.().catch((error: unknown) => { if (!isLapse(error)) log.warn(`${job.reason} during the memorize backlog failed`, error); });
    }
  }

  // A player's own Stop is not a failure, so it is a note, never `lastError`.
  private async endBacklog(read: RunGuard, stop: AbortSignal, run: { completed: boolean; failure: string | null; windows: number }): Promise<boolean> {
    const lapse = read.lapsed();
    if (lapse && lapse !== "window" && lapse !== "version") return false;
    const memory = this.deps.memory();
    const total = run.windows + 1;
    const processed = run.completed ? total : memory.backfill?.processed ?? 0;
    const stopped = !run.completed && !lapse && stop.aborted;
    const lastError = run.completed || stopped ? null
      : lapse === "window" ? BACKLOG_STOPPED_BY_EDIT
        : lapse === "version" ? BACKLOG_STOPPED_BY_UPDATE
          : run.failure ?? "Memorize backlog failed";
    memory.setBackfill({ running: false, processed, total, lastError, ...(stopped ? { stoppedNote: backlogStoppedByPlayer(processed, run.windows) } : {}) });
    this.deps.setStatus(run.completed ? "Memorize backlog complete" : stopped ? "Memorize backlog stopped" : "Memorize backlog failed");
    await this.deps.save();
    return run.completed;
  }
}

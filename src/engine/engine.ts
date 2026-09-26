import { ApplyQueue, type ApplyQueueEntry, type QueueDrainResult } from "./applyQueue";
import { Blackboard, type BlackboardSnapshot } from "./blackboard";
import { applyTransitionProgress } from "./convergence";
import type { CheckpointEffects, NormalizedStoryV2, NormalizedTransition, PrimitiveValue } from "./schema";
import { selectFiring } from "./transitions";

export interface EngineHost {
  now(): number;
}

export interface BoundaryContext {
  lastMessageId: number;
  chatLength: number;
}

export interface EngineState {
  blackboard: BlackboardSnapshot;
  activeCheckpointId: string;
  visitedAnchors: string[];
  visitedPath: string[];
  boundary: number;
  checkpointStartedBoundary: number;
  checkpointStartedAt: number;
  checkpointStartedMessageId: number;
  lastMessageId: number;
  chatLength: number;
}

export interface BoundaryResult {
  boundary: number;
  queue: QueueDrainResult;
  fired: NormalizedTransition | null;
  effects: CheckpointEffects | null;
  activeCheckpointId: string;
  context: BoundaryContext;
  previousLastMessageId: number;
}

export interface BoundaryLogEntry {
  at: number;
  boundary: number;
  before: EngineState;
  after: EngineState;
  fired: NormalizedTransition | null;
  source: "gate" | "manual";
  context: BoundaryContext;
  queue: QueueDrainResult;
  evaluated: Record<string, PrimitiveValue> | null;
}

// The oldest point a rollback can reach, and everything that gets there. Persisted with the state:
// without it a reload cannot honour an edit to a message the run has already passed, and
// without a floor a rollback past the retained window would silently do nothing.
//
// `base` is the state AT `from` — the floor itself, restorable. The log alone is not enough: its
// oldest entry describes a transition FROM a state nothing retains, so after a reload an edit to
// the chat's own first message had nothing to roll back to and reported the history as gone while
// the run was one boundary old (found live).
export interface EngineHistory {
  from: { boundary: number; messageId: number };
  base: EngineState;
  log: BoundaryLogEntry[];
}

// Contract: a caller can tell "nothing to undo" from "the history is gone", and the second
// carries the floor so a recovery notice can name it.
export type RollbackOutcome =
  | { ok: true; result: "applied" | "noop" }
  | { ok: false; reason: "history-unavailable"; oldest: { boundary: number; messageId: number } };

export const ROLLBACK_HORIZON = 200;

const DEFAULT_HOST: EngineHost = { now: () => Date.now() };

// A story edit can take away the checkpoint a chat was parked at (a generated chain that no longer
// merges). The chat resumes at the newest checkpoint of its trail that the graph still has.
export function repairActiveCheckpoint(state: EngineState, story: NormalizedStoryV2): { state: EngineState; detail: string | null } {
  if (story.checkpointById[state.activeCheckpointId]) return { state, detail: null };
  const trail = [...[...state.visitedPath].reverse(), ...[...state.visitedAnchors].reverse()];
  const fallback = trail.find((id) => story.checkpointById[id]) ?? story.startCheckpointId;
  const keep = (ids: string[]) => ids.filter((id) => story.checkpointById[id]);
  return {
    state: { ...state, activeCheckpointId: fallback, visitedAnchors: keep(state.visitedAnchors), visitedPath: keep(state.visitedPath) },
    detail: `the saved checkpoint ${state.activeCheckpointId} is not in this story's graph; resumed at ${fallback}`,
  };
}

export class StoryEngine {
  private story: NormalizedStoryV2 | null = null;
  private blackboard: Blackboard | null = null;
  private queue = new ApplyQueue();
  private activeCheckpointId = "";
  private visitedAnchors: string[] = [];
  private visitedPath: string[] = [];
  private boundary = 0;
  private checkpointStartedBoundary = 0;
  private checkpointStartedAt = 0;
  private checkpointStartedMessageId = -1;
  private lastMessageId = -1;
  private chatLength = 0;
  private readonly snapshots = new Map<number, EngineState>();
  private readonly boundaryLog: BoundaryLogEntry[] = [];
  private readonly advanceCallbacks = new Set<(transition: NormalizedTransition) => void>();

  constructor(private readonly host: EngineHost = DEFAULT_HOST) {}

  hydrateRepair: string | null = null;

  loadStory(normalized: NormalizedStoryV2): void {
    this.story = normalized;
    this.hydrateRepair = null;
    this.blackboard = new Blackboard(normalized);
    this.queue = new ApplyQueue();
    this.activeCheckpointId = normalized.startCheckpointId;
    this.visitedAnchors = normalized.checkpointById[this.activeCheckpointId]?.type === "anchor" ? [this.activeCheckpointId] : [];
    this.visitedPath = [this.activeCheckpointId];
    this.boundary = 0;
    this.checkpointStartedBoundary = 0;
    this.checkpointStartedAt = this.host.now();
    this.checkpointStartedMessageId = -1;
    this.lastMessageId = -1;
    this.chatLength = 0;
    this.snapshots.clear();
    this.boundaryLog.length = 0;
    this.recordSnapshot();
  }

  hydrate(saved: EngineState, history: EngineHistory | null = null): void {
    const repaired = repairActiveCheckpoint(saved, this.requireStory());
    const state = repaired.state;
    this.hydrateRepair = repaired.detail;
    this.blackboard = new Blackboard(this.requireStory(), state.blackboard);
    this.queue = new ApplyQueue();
    this.restoreStateFields(state);
    this.hydrateHistory(history);
  }

  // What a reload needs to still recognise an edit to a message the run has already passed. The
  // log carries a complete state per boundary, so restoring one is exact rather than replayed, and
  // the base is the state the oldest of them started from.
  serializeHistory(): EngineHistory {
    const oldest = this.boundaryLog[0];
    const base = oldest ? oldest.before : this.serialize();
    return { from: { boundary: base.boundary, messageId: base.lastMessageId }, base, log: this.boundaryLog.map((entry) => ({ ...entry })) };
  }

  hydrateHistory(history: EngineHistory | null): void {
    this.boundaryLog.length = 0;
    this.snapshots.clear();
    if (!history) {
      // swapStory hydrates without a history: this chat can only roll back from now on.
      this.recordSnapshot();
      return;
    }
    this.snapshots.set(history.base.boundary, history.base);
    history.log.forEach((entry) => this.boundaryLog.push({ ...entry }));
    this.boundaryLog.forEach((entry) => this.snapshots.set(entry.boundary, entry.after));
    this.recordSnapshot();
  }

  historyFrom(): { boundary: number; messageId: number } {
    // The floor is the oldest snapshot the log does not itself describe — the base. Everything the
    // log covers IS reachable, so naming the base is naming the oldest state a rollback can restore.
    const logged = new Set(this.boundaryLog.map((entry) => entry.boundary));
    const baseBoundary = [...this.snapshots.keys()].filter((key) => !logged.has(key)).sort((left, right) => left - right)[0];
    const base = baseBoundary === undefined ? undefined : this.snapshots.get(baseBoundary);
    if (base) return { boundary: base.boundary, messageId: base.lastMessageId };
    const oldest = this.boundaryLog[0];
    return oldest ? { boundary: oldest.boundary, messageId: oldest.after.lastMessageId } : { boundary: this.boundary, messageId: this.lastMessageId };
  }

  // A merged or staled expansion changes the graph under a live run. Reloading and
  // hydrating dropped the pending writes (a staled chain at the start of a boundary threw away the
  // write that boundary was committing) and the boundary history rollback needs.
  replaceGraph(normalized: NormalizedStoryV2): void {
    const state = this.serialize();
    const history = this.serializeHistory();
    const pending = this.queue.flush();
    this.loadStory(normalized);
    this.hydrate(state, history);
    pending.forEach((write) => this.queue.enqueue(write));
  }

  getBoundary(): number {
    return this.boundary;
  }

  serialize(): EngineState {
    return {
      blackboard: this.requireBlackboard().snapshot(),
      activeCheckpointId: this.activeCheckpointId,
      visitedAnchors: [...this.visitedAnchors],
      visitedPath: [...this.visitedPath],
      boundary: this.boundary,
      checkpointStartedBoundary: this.checkpointStartedBoundary,
      checkpointStartedAt: this.checkpointStartedAt,
      checkpointStartedMessageId: this.checkpointStartedMessageId,
      lastMessageId: this.lastMessageId,
      chatLength: this.chatLength,
    };
  }

  enqueue(write: ApplyQueueEntry): void {
    this.queue.enqueue(write);
  }

  commitBoundary(context: BoundaryContext = this.currentContext()): BoundaryResult {
    const story = this.requireStory();
    const blackboard = this.requireBlackboard();
    const before = this.serialize();
    const normalizedContext = this.normalizeContext(context);
    this.lastMessageId = normalizedContext.lastMessageId;
    this.chatLength = normalizedContext.chatLength;
    const queue = this.queue.drainAtBoundary(blackboard);
    this.refreshMechanicalQualities();

    const outgoing = story.outgoingByCheckpoint[this.activeCheckpointId] ?? [];
    const evaluated = blackboard.snapshot().values;
    const fired = selectFiring(outgoing, blackboard);
    let effects: CheckpointEffects | null = null;

    if (fired) {
      applyTransitionProgress(blackboard, fired);
      this.activeCheckpointId = fired.to;
      this.checkpointStartedBoundary = this.boundary + 1;
      this.checkpointStartedAt = this.host.now();
      this.checkpointStartedMessageId = normalizedContext.lastMessageId;
      const checkpoint = story.checkpointById[fired.to];
      if (checkpoint?.type === "anchor") this.visitedAnchors.push(fired.to);
      this.visitedPath.push(fired.to);
      effects = checkpoint?.effects ?? null;
      this.advanceCallbacks.forEach((callback) => callback(fired));
    }

    this.boundary += 1;
    const after = this.serialize();
    this.boundaryLog.push({ at: this.host.now(), boundary: this.boundary, before, after, fired, source: "gate", context: normalizedContext, queue, evaluated });
    if (this.boundaryLog.length > 200) this.boundaryLog.shift();
    this.recordSnapshot();

    return { boundary: this.boundary, queue, fired, effects, activeCheckpointId: this.activeCheckpointId, context: normalizedContext, previousLastMessageId: before.lastMessageId };
  }

  // Three outcomes, and a caller can tell them apart. `noop` means the run is already at or
  // before that point; `unavailable` means the history that would get there is gone, which the
  // caller must report rather than treat as "nothing changed".
  rollbackTo(boundary: number): RollbackOutcome {
    if (boundary >= this.boundary) return { ok: true, result: "noop" };
    const snapshotBoundary = [...this.snapshots.keys()].filter((candidate) => candidate <= boundary).sort((a, b) => b - a)[0];
    if (snapshotBoundary === undefined) return { ok: false, reason: "history-unavailable", oldest: this.historyFrom() };
    const snapshot = this.snapshots.get(snapshotBoundary);
    if (!snapshot) return { ok: false, reason: "history-unavailable", oldest: this.historyFrom() };
    this.blackboard = new Blackboard(this.requireStory(), snapshot.blackboard);
    this.queue.flush();
    this.restoreStateFields(snapshot);
    [...this.snapshots.keys()].forEach((key) => {
      if (key > snapshotBoundary) this.snapshots.delete(key);
    });
    for (let index = this.boundaryLog.length - 1; index >= 0; index -= 1) {
      if (this.boundaryLog[index].boundary > snapshotBoundary) this.boundaryLog.splice(index, 1);
    }
    return { ok: true, result: "applied" };
  }

  activateCheckpoint(id: string, context: BoundaryContext = this.currentContext()): BoundaryResult {
    const story = this.requireStory();
    const checkpoint = story.checkpointById[id];
    if (!checkpoint) throw new Error(`Unknown checkpoint '${id}'`);
    const before = this.serialize();
    const normalizedContext = this.normalizeContext(context);
    this.lastMessageId = normalizedContext.lastMessageId;
    this.chatLength = normalizedContext.chatLength;
    const queue = this.queue.drainAtBoundary(this.requireBlackboard());
    this.activeCheckpointId = id;
    this.checkpointStartedBoundary = this.boundary + 1;
    this.checkpointStartedAt = this.host.now();
    this.checkpointStartedMessageId = normalizedContext.lastMessageId;
    if (checkpoint.type === "anchor") this.visitedAnchors.push(id);
    this.visitedPath.push(id);
    this.boundary += 1;
    const after = this.serialize();
    this.boundaryLog.push({ at: this.host.now(), boundary: this.boundary, before, after, fired: null, source: "manual", context: normalizedContext, queue, evaluated: null });
    if (this.boundaryLog.length > 200) this.boundaryLog.shift();
    this.recordSnapshot();
    return {
      boundary: this.boundary,
      queue,
      fired: null,
      effects: checkpoint.effects ?? null,
      activeCheckpointId: this.activeCheckpointId,
      context: normalizedContext,
      previousLastMessageId: before.lastMessageId,
    };
  }

  // `null` is not "boundary 0": it is "the state before this message is no longer retained", which
  // only the caller can turn into the honest outcome.
  boundaryBeforeMessage(messageId: number): number | null {
    const normalized = Math.max(0, Math.floor(messageId));
    const candidate = [...this.snapshots.values()]
      .filter((snapshot) => snapshot.lastMessageId < normalized)
      .sort((left, right) => right.boundary - left.boundary)[0];
    if (candidate) return candidate.boundary;
    return this.oldestRetainedBoundary() > 0 ? null : 0;
  }

  private oldestRetainedBoundary(): number {
    const oldestSnapshot = [...this.snapshots.keys()].sort((left, right) => left - right)[0];
    const oldestLogged = this.boundaryLog[0]?.boundary;
    return Math.min(oldestSnapshot ?? Number.POSITIVE_INFINITY, oldestLogged ?? Number.POSITIVE_INFINITY);
  }

  // A delete with nothing to undo still takes the chat's end from under the cursor.
  // Left at the old end, the next boundary scanned from past the new messages and every window
  // started after them (lastMessageId 7 over a chat of 1).
  // A queued write read the chat as it was. A mutation at or before the end of its read window changed
  // what it read, and a rollback that restores nothing never reaches `rollbackTo`'s flush.
  discardPendingFrom(messageId: number): ApplyQueueEntry[] {
    return Number.isFinite(messageId) ? this.queue.discardReadingFrom(messageId) : [];
  }

  clampToChat(chatLength: number): boolean {
    const last = Math.max(-1, Math.floor(chatLength) - 1);
    if (!Number.isFinite(last) || this.lastMessageId <= last) return false;
    this.lastMessageId = last;
    this.chatLength = last + 1;
    this.checkpointStartedMessageId = Math.min(this.checkpointStartedMessageId, last);
    return true;
  }

  shouldRollbackFromMessage(messageId: number): boolean {
    const normalized = Math.max(0, Math.floor(messageId));
    return this.boundaryLog.some((entry) => {
      if (entry.context.lastMessageId < normalized) return false;
      if (entry.fired) return true;
      return entry.queue.applied.some((applied) => applied.turnRange && applied.turnRange.to >= normalized);
    });
  }

  get activeCheckpoint() {
    const story = this.requireStory();
    return story.checkpointById[this.activeCheckpointId];
  }

  // Every checkpoint this run entered, in order, ending at the active one.
  get checkpointPath(): string[] {
    return [...this.visitedPath];
  }

  get stateLog(): BoundaryLogEntry[] {
    return [...this.boundaryLog];
  }

  get pendingWrites(): ApplyQueueEntry[] {
    return this.queue.peek();
  }

  onAdvance(callback: (transition: NormalizedTransition) => void): () => void {
    this.advanceCallbacks.add(callback);
    return () => this.advanceCallbacks.delete(callback);
  }

  private refreshMechanicalQualities(): void {
    const story = this.requireStory();
    const blackboard = this.requireBlackboard();
    if (story.qualityByKey.message_count?.source === "code") {
      blackboard.applyDelta({ q: "message_count", v: this.chatLength, source: "code" });
    }
    if (story.qualityByKey.messages_in_checkpoint?.source === "code") {
      blackboard.applyDelta({ q: "messages_in_checkpoint", v: this.boundary - this.checkpointStartedBoundary + 1, source: "code" });
    }
    if (story.qualityByKey.elapsed?.source === "code") {
      blackboard.applyDelta({ q: "elapsed", v: Math.max(0, Math.floor((this.host.now() - this.checkpointStartedAt) / 1000)), source: "code" });
    }
  }

  private recordSnapshot(): void {
    this.snapshots.set(this.boundary, this.serialize());
    if (this.snapshots.size > 200) {
      const oldest = [...this.snapshots.keys()].sort((a, b) => a - b)[0];
      this.snapshots.delete(oldest);
    }
  }

  private currentContext(): BoundaryContext {
    return { lastMessageId: this.lastMessageId, chatLength: this.chatLength };
  }

  private restoreStateFields(state: EngineState): void {
    this.activeCheckpointId = state.activeCheckpointId;
    this.visitedAnchors = [...state.visitedAnchors];
    this.visitedPath = [...state.visitedPath];
    this.boundary = state.boundary;
    this.checkpointStartedBoundary = state.checkpointStartedBoundary;
    this.checkpointStartedAt = state.checkpointStartedAt;
    this.checkpointStartedMessageId = state.checkpointStartedMessageId;
    this.lastMessageId = state.lastMessageId;
    this.chatLength = state.chatLength;
  }

  private normalizeContext(context: BoundaryContext): BoundaryContext {
    const chatLength = Math.max(0, Math.floor(Number.isFinite(context.chatLength) ? context.chatLength : this.chatLength));
    const lastMessageId = Math.max(-1, Math.floor(Number.isFinite(context.lastMessageId) ? context.lastMessageId : chatLength - 1));
    return { lastMessageId, chatLength };
  }

  private requireStory(): NormalizedStoryV2 {
    if (!this.story) throw new Error("StoryEngine has no loaded story");
    return this.story;
  }

  private requireBlackboard(): Blackboard {
    if (!this.blackboard) throw new Error("StoryEngine has no blackboard");
    return this.blackboard;
  }
}

import { ApplyQueue, type ApplyQueueEntry, type QueueDrainResult } from "./applyQueue";
import { Blackboard, type BlackboardSnapshot } from "./blackboard";
import { applyTransitionProgress } from "./convergence";
import type { CheckpointEffects, NormalizedStoryV2, NormalizedTransition } from "./schema";
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
}

export interface BoundaryLogEntry {
  boundary: number;
  before: EngineState;
  after: EngineState;
  fired: NormalizedTransition | null;
  source: "gate" | "manual";
  context: BoundaryContext;
  queue: QueueDrainResult;
}

const DEFAULT_HOST: EngineHost = { now: () => Date.now() };

export class StoryEngine {
  private story: NormalizedStoryV2 | null = null;
  private blackboard: Blackboard | null = null;
  private queue = new ApplyQueue();
  private activeCheckpointId = "";
  private visitedAnchors: string[] = [];
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

  loadStory(normalized: NormalizedStoryV2): void {
    this.story = normalized;
    this.blackboard = new Blackboard(normalized);
    this.queue = new ApplyQueue();
    this.activeCheckpointId = normalized.startCheckpointId;
    this.visitedAnchors = normalized.checkpointById[this.activeCheckpointId]?.type === "anchor" ? [this.activeCheckpointId] : [];
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

  hydrate(state: EngineState): void {
    this.blackboard = new Blackboard(this.requireStory(), state.blackboard);
    this.queue = new ApplyQueue();
    this.restoreStateFields(state);
    this.snapshots.clear();
    this.boundaryLog.length = 0;
    this.recordSnapshot();
  }

  getBoundary(): number {
    return this.boundary;
  }

  serialize(): EngineState {
    return {
      blackboard: this.requireBlackboard().snapshot(),
      activeCheckpointId: this.activeCheckpointId,
      visitedAnchors: [...this.visitedAnchors],
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
      effects = checkpoint?.effects ?? null;
      this.advanceCallbacks.forEach((callback) => callback(fired));
    }

    this.boundary += 1;
    const after = this.serialize();
    this.boundaryLog.push({ boundary: this.boundary, before, after, fired, source: "gate", context: normalizedContext, queue });
    if (this.boundaryLog.length > 200) this.boundaryLog.shift();
    this.recordSnapshot();

    return { boundary: this.boundary, queue, fired, effects, activeCheckpointId: this.activeCheckpointId, context: normalizedContext };
  }

  rollbackTo(boundary: number): boolean {
    if (boundary >= this.boundary) return false;
    const snapshotBoundary = [...this.snapshots.keys()].filter((candidate) => candidate <= boundary).sort((a, b) => b - a)[0];
    if (snapshotBoundary === undefined) return false;
    const snapshot = this.snapshots.get(snapshotBoundary);
    if (!snapshot) return false;
    this.blackboard = new Blackboard(this.requireStory(), snapshot.blackboard);
    this.queue.flush();
    this.restoreStateFields(snapshot);
    [...this.snapshots.keys()].forEach((key) => {
      if (key > snapshotBoundary) this.snapshots.delete(key);
    });
    for (let index = this.boundaryLog.length - 1; index >= 0; index -= 1) {
      if (this.boundaryLog[index].boundary > snapshotBoundary) this.boundaryLog.splice(index, 1);
    }
    return true;
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
    this.boundary += 1;
    const after = this.serialize();
    this.boundaryLog.push({ boundary: this.boundary, before, after, fired: null, source: "manual", context: normalizedContext, queue });
    if (this.boundaryLog.length > 200) this.boundaryLog.shift();
    this.recordSnapshot();
    return { boundary: this.boundary, queue, fired: null, effects: checkpoint.effects ?? null, activeCheckpointId: this.activeCheckpointId, context: normalizedContext };
  }

  boundaryBeforeMessage(messageId: number): number {
    const normalized = Math.max(0, Math.floor(messageId));
    const candidate = [...this.snapshots.values()]
      .filter((snapshot) => snapshot.lastMessageId < normalized)
      .sort((left, right) => right.boundary - left.boundary)[0];
    return candidate?.boundary ?? 0;
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

  get stateLog(): BoundaryLogEntry[] {
    return [...this.boundaryLog];
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
    this.boundary = state.boundary;
    this.checkpointStartedBoundary = state.checkpointStartedBoundary ?? state.boundary;
    this.checkpointStartedAt = state.checkpointStartedAt ?? this.host.now();
    this.checkpointStartedMessageId = state.checkpointStartedMessageId ?? state.lastMessageId ?? Math.max(-1, state.boundary - 1);
    this.lastMessageId = state.lastMessageId ?? Math.max(-1, state.boundary - 1);
    this.chatLength = state.chatLength ?? Math.max(0, this.lastMessageId + 1);
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

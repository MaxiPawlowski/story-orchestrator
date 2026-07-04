import { ApplyQueue, type ApplyQueueEntry, type QueueDrainResult } from "./applyQueue";
import { Blackboard, type BlackboardSnapshot } from "./blackboard";
import { applyTransitionProgress } from "./convergence";
import type { CheckpointEffects, NormalizedStoryV2, NormalizedTransition } from "./schema";
import { selectFiring } from "./transitions";

export interface EngineHost {
  now(): number;
}

export interface EngineState {
  blackboard: BlackboardSnapshot;
  activeCheckpointId: string;
  visitedAnchors: string[];
  boundary: number;
}

export interface BoundaryResult {
  boundary: number;
  queue: QueueDrainResult;
  fired: NormalizedTransition | null;
  effects: CheckpointEffects | null;
  activeCheckpointId: string;
}

export interface BoundaryLogEntry {
  boundary: number;
  before: EngineState;
  after: EngineState;
  fired: NormalizedTransition | null;
}

const DEFAULT_HOST: EngineHost = { now: () => Date.now() };

export class StoryEngine {
  private story: NormalizedStoryV2 | null = null;
  private blackboard: Blackboard | null = null;
  private queue = new ApplyQueue();
  private activeCheckpointId = "";
  private visitedAnchors: string[] = [];
  private boundary = 0;
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
    this.snapshots.clear();
    this.boundaryLog.length = 0;
    this.recordSnapshot();
  }

  hydrate(state: EngineState): void {
    const story = this.requireStory();
    this.blackboard = new Blackboard(story, state.blackboard);
    this.queue = new ApplyQueue();
    this.activeCheckpointId = state.activeCheckpointId;
    this.visitedAnchors = [...state.visitedAnchors];
    this.boundary = state.boundary;
    this.snapshots.clear();
    this.boundaryLog.length = 0;
    this.recordSnapshot();
  }

  serialize(): EngineState {
    return {
      blackboard: this.requireBlackboard().snapshot(),
      activeCheckpointId: this.activeCheckpointId,
      visitedAnchors: [...this.visitedAnchors],
      boundary: this.boundary,
    };
  }

  enqueue(write: ApplyQueueEntry): void {
    this.queue.enqueue(write);
  }

  commitBoundary(): BoundaryResult {
    const story = this.requireStory();
    const blackboard = this.requireBlackboard();
    const before = this.serialize();
    const queue = this.queue.drainAtBoundary(blackboard);
    this.refreshMechanicalQualities();

    const outgoing = story.outgoingByCheckpoint[this.activeCheckpointId] ?? [];
    const fired = selectFiring(outgoing, blackboard);
    let effects: CheckpointEffects | null = null;

    if (fired) {
      applyTransitionProgress(blackboard, fired);
      this.activeCheckpointId = fired.to;
      const checkpoint = story.checkpointById[fired.to];
      if (checkpoint?.type === "anchor") this.visitedAnchors.push(fired.to);
      effects = checkpoint?.effects ?? null;
      this.advanceCallbacks.forEach((callback) => callback(fired));
    }

    this.boundary += 1;
    const after = this.serialize();
    this.boundaryLog.push({ boundary: this.boundary, before, after, fired });
    if (this.boundaryLog.length > 200) this.boundaryLog.shift();
    this.recordSnapshot();

    return { boundary: this.boundary, queue, fired, effects, activeCheckpointId: this.activeCheckpointId };
  }

  rollbackTo(boundary: number): boolean {
    if (boundary >= this.boundary) return false;
    const snapshotBoundary = [...this.snapshots.keys()].filter((candidate) => candidate <= boundary).sort((a, b) => b - a)[0];
    if (snapshotBoundary === undefined) return false;
    const snapshot = this.snapshots.get(snapshotBoundary);
    if (!snapshot) return false;
    this.hydrate(snapshot);
    [...this.snapshots.keys()].forEach((key) => {
      if (key > snapshotBoundary) this.snapshots.delete(key);
    });
    return true;
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
      blackboard.applyDelta({ q: "message_count", v: this.boundary + 1, source: "code" });
    }
    void this.host.now();
  }

  private recordSnapshot(): void {
    this.snapshots.set(this.boundary, this.serialize());
    if (this.snapshots.size > 200) {
      const oldest = [...this.snapshots.keys()].sort((a, b) => a - b)[0];
      this.snapshots.delete(oldest);
    }
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

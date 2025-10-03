import type { NormalizedStory } from "@services/SchemaService/story-validator";
import {
  loadStoryState,
  makeDefaultState,
  persistStoryState,
  clampCheckpointIndex,
  sanitizeTurnsSinceEval,
  type RuntimeStoryState,
  type CheckpointStatus,
} from "@services/StoryService/story-state";

export interface StoryStateServiceOptions {
  onStateChange?: (state: RuntimeStoryState, meta: { hydrated: boolean }) => void;
  onActivateCheckpoint?: (index: number) => void;
}

interface SyncSessionArgs {
  story: NormalizedStory | null | undefined;
  chatId: string | null | undefined;
  groupChatSelected: boolean;
}

class StoryStateService {
  private onStateChange?: (state: RuntimeStoryState, meta: { hydrated: boolean }) => void;
  private onActivateCheckpoint?: (index: number) => void;
  private story: NormalizedStory | null = null;
  private chatId: string | null = null;
  private groupChatSelected = false;
  private hydrated = false;
  private state: RuntimeStoryState = makeDefaultState(null);

  constructor(options?: StoryStateServiceOptions) {
    this.onStateChange = options?.onStateChange;
    this.onActivateCheckpoint = options?.onActivateCheckpoint;
  }

  getState(): RuntimeStoryState {
    return this.state;
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  setOnActivateCheckpoint(callback?: (index: number) => void): void {
    this.onActivateCheckpoint = callback;
    if (callback && this.hydrated) {
      try {
        callback(this.state.checkpointIndex);
      } catch (err) {
        console.warn("[StoryStateService] onActivateCheckpoint handler failed", err);
      }
    }
  }

  syncSession({ story, chatId, groupChatSelected }: SyncSessionArgs): void {
    this.story = story ?? null;
    this.chatId = chatId ?? null;
    this.groupChatSelected = !!groupChatSelected;

    if (!this.groupChatSelected || !this.story) {
      this.hydrated = false;
      this.state = makeDefaultState(this.story);
      this.emitState();
      return;
    }

    const loaded = loadStoryState({ chatId: this.chatId, story: this.story });
    this.state = {
      ...loaded.state,
      turnsSinceEval: sanitizeTurnsSinceEval(loaded.state.turnsSinceEval),
    };
    this.hydrated = true;
    this.emitState();
    this.onActivateCheckpoint?.(this.state.checkpointIndex);
  }

  setTurnsSinceEval(next: number): void {
    const sanitized = sanitizeTurnsSinceEval(next);
    if (sanitized === this.state.turnsSinceEval) return;
    this.state = {
      ...this.state,
      turnsSinceEval: sanitized,
    };
    this.persist();
    this.emitState();
  }

  activateCheckpoint(index: number): void {
    if (!this.story) return;

    const sanitizedIndex = clampCheckpointIndex(index, this.story);
    const nextStatuses = this.buildStatuses(sanitizedIndex);
    if (
      sanitizedIndex === this.state.checkpointIndex
      && shallowStatusesEqual(nextStatuses, this.state.checkpointStatuses)
    ) {
      // ensure we still reset the turn counter for the checkpoint even if index/states unchanged
      if (this.state.turnsSinceEval !== 0) {
        this.state = {
          ...this.state,
          turnsSinceEval: 0,
        };
        this.persist();
        this.emitState();
      }
      return;
    }

    this.state = {
      ...this.state,
      checkpointIndex: sanitizedIndex,
      checkpointStatuses: nextStatuses,
      turnsSinceEval: 0,
    };

    this.persist();
    this.emitState();
    this.onActivateCheckpoint?.(sanitizedIndex);
  }

  updateCheckpointStatus(index: number, status: CheckpointStatus): void {
    if (!this.story) return;
    const total = this.story.checkpoints?.length ?? 0;
    if (index < 0 || index >= total) return;

    const nextStatuses = this.state.checkpointStatuses.slice();
    nextStatuses[index] = status;

    this.state = {
      ...this.state,
      checkpointStatuses: nextStatuses,
    };
    this.persist();
    this.emitState();
  }

  dispose(): void {
    this.story = null;
    this.chatId = null;
    this.groupChatSelected = false;
    this.hydrated = false;
    this.state = makeDefaultState(null);
  }

  private buildStatuses(activeIndex: number): CheckpointStatus[] {
    const checkpoints = this.story?.checkpoints ?? [];
    if (!checkpoints.length) return [];

    const prev = Array.isArray(this.state.checkpointStatuses) ? this.state.checkpointStatuses : [];

    return checkpoints.map((_cp, idx) => {
      if (idx < activeIndex) return "complete";
      if (idx === activeIndex) {
        return prev[idx] === "failed" ? "failed" : "current";
      }
      return prev[idx] ?? "pending";
    });
  }

  private emitState(): void {
    this.onStateChange?.(this.state, { hydrated: this.hydrated });
  }

  private persist(): void {
    if (!this.hydrated) return;
    if (!this.story) return;
    if (!this.groupChatSelected) return;
    persistStoryState({
      chatId: this.chatId,
      story: this.story,
      state: this.state,
    });
  }
}

const shallowStatusesEqual = (a: CheckpointStatus[], b: CheckpointStatus[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export default StoryStateService;

import type { NormalizedStory } from "@services/SchemaService/story-validator";
import {
  loadStoryState,
  makeDefaultState,
  persistStoryState,
  clampCheckpointIndex,
  sanitizeTurnsSinceEval,
  type RuntimeStoryState,
  type CheckpointStatus,
} from "@utils/story-state";
import { eventSource, event_types, getContext } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";

export interface StoryStateServiceOptions {
  onStateChange?: (state: RuntimeStoryState, meta: { hydrated: boolean }) => void;
  onActivateCheckpoint?: (index: number) => void;
}

class StoryStateService {
  private listeners = new Set<(state: RuntimeStoryState, meta: { hydrated: boolean }) => void>();
  private onActivateCheckpoint?: (index: number) => void;
  private story: NormalizedStory | null = null;
  private chatId: string | null = null;
  private groupChatSelected = false;
  private hydrated = false;
  private state: RuntimeStoryState = makeDefaultState(null);
  private started = false;
  private unsubscribe: (() => void) | null = null;

  constructor(options?: StoryStateServiceOptions) {
    if (options?.onStateChange) {
      this.subscribe(options.onStateChange);
    }
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

  subscribe(listener: (state: RuntimeStoryState, meta: { hydrated: boolean }) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.refreshSession({ reason: 'start' });
    this.unsubscribe = subscribeToEventSource({
      source: eventSource,
      eventName: event_types.CHAT_CHANGED,
      handler: () => this.refreshSession({ reason: 'chat_changed' }),
    });
  }

  setStory(story: NormalizedStory | null | undefined): void {
    this.story = story ?? null;
    this.refreshSession({ reason: 'story_changed', force: true });
  }

  private refreshSession(opts: { reason: string; force?: boolean }) {
    const prevChat = this.chatId;
    const prevGroup = this.groupChatSelected;

    try {
      const { chatId, groupId } = (getContext() || {}) as { chatId?: unknown; groupId?: unknown };
      this.chatId = chatId == null ? null : (String(chatId).trim() || null);
      this.groupChatSelected = Boolean(groupId);
    } catch (err) {
      console.warn('[StoryStateService] Failed to read context', err);
      this.chatId = null;
      this.groupChatSelected = false;
    }

    const contextChanged = prevChat !== this.chatId || prevGroup !== this.groupChatSelected;
    if (!contextChanged && !opts.force) return;

    if (!this.groupChatSelected || !this.story) {
      this.resetState(false);
      return;
    }

    try {
      const loaded = loadStoryState({ chatId: this.chatId, story: this.story });
      this.state = {
        ...loaded.state,
        turnsSinceEval: sanitizeTurnsSinceEval(loaded.state.turnsSinceEval),
      };
      this.hydrated = true;
      this.emitState();
      this.onActivateCheckpointSafe(this.state.checkpointIndex);
    } catch (e) {
      console.warn('[StoryStateService] hydrate failed; falling back to default', e);
      this.resetState(true);
    }
  }

  private resetState(emitActivate: boolean) {
    this.hydrated = false;
    this.state = makeDefaultState(this.story);
    this.emitState();
    if (emitActivate) this.onActivateCheckpointSafe(this.state.checkpointIndex);
  }

  private onActivateCheckpointSafe(index: number) {
    try { this.onActivateCheckpoint?.(index); } catch (err) { console.warn('[StoryStateService] onActivateCheckpoint handler failed', err); }
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

    const sameIndex = sanitizedIndex === this.state.checkpointIndex;
    const sameStatuses = shallowStatusesEqual(nextStatuses, this.state.checkpointStatuses);
    if (sameIndex && sameStatuses && this.state.turnsSinceEval === 0) return;

    this.state = {
      ...this.state,
      checkpointIndex: sanitizedIndex,
      checkpointStatuses: nextStatuses,
      turnsSinceEval: 0,
    };
    this.persist();
    this.emitState();
    this.onActivateCheckpointSafe(sanitizedIndex);
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
    try { this.unsubscribe?.(); } catch { /* noop */ }
    this.unsubscribe = null;
    this.started = false;
    this.story = null;
    this.chatId = null;
    this.groupChatSelected = false;
    this.hydrated = false;
    this.state = makeDefaultState(null);
    this.listeners.clear();
  }

  private buildStatuses(activeIndex: number): CheckpointStatus[] {
    const checkpoints = this.story?.checkpoints ?? [];
    if (!checkpoints.length) return [];

    const prev = Array.isArray(this.state.checkpointStatuses) ? this.state.checkpointStatuses : [];
    return checkpoints.map((_cp, idx) =>
      idx < activeIndex
        ? 'complete'
        : idx === activeIndex
          ? (prev[idx] === 'failed' ? 'failed' : 'current')
          : (prev[idx] ?? 'pending')
    );
  }

  private emitState(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state, { hydrated: this.hydrated });
      } catch (err) {
        console.warn("[StoryStateService] state listener failed", err);
      }
    });
  }

  private persist(): void {
    if (!this.hydrated || !this.story || !this.groupChatSelected) return;
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

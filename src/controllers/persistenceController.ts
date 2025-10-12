import { storySessionStore } from "@store/storySessionStore";
import type { StorySessionStore } from "@store/storySessionStore";
import type { CheckpointStatus, RuntimeStoryState } from "@utils/story-state";
import { loadStoryState, persistStoryState, sanitizeChatKey } from "@utils/story-state";
import type { NormalizedStory } from "@utils/story-validator";

interface WriteRuntimeOptions {
  persist?: boolean;
  hydrated?: boolean;
  skipStore?: boolean;
}

export interface HydrateResult {
  runtime: RuntimeStoryState;
  source: "stored" | "default";
  storyKey: string | null;
}

export interface PersistenceController {
  setStory(next: NormalizedStory | null | undefined): RuntimeStoryState;
  setChatContext(ctx: { chatId: string | null | undefined; groupChatSelected: boolean | null | undefined }): void;
  resetRuntime(): RuntimeStoryState;
  hydrate(): HydrateResult;
  writeRuntime(next: RuntimeStoryState, options?: WriteRuntimeOptions): RuntimeStoryState;
  setTurnsSinceEval(next: number, options?: { persist?: boolean }): RuntimeStoryState;
  setCheckpointTurnCount(next: number, options?: { persist?: boolean }): RuntimeStoryState;
  updateCheckpointStatus(index: number, status: CheckpointStatus, options?: { persist?: boolean }): RuntimeStoryState;
  dispose(): void;
  canPersist(): boolean;
  isHydrated(): boolean;
}

const persistIfAllowed = (store: StorySessionStore, runtime: RuntimeStoryState) => {
  const { story, groupChatSelected, chatId, storyKey } = store.getState();
  if (!story) return false;
  if (!groupChatSelected) return false;
  if (!chatId) return false;
  try {
    persistStoryState({ chatId, story, state: runtime, storyKey });
    return true;
  } catch (err) {
    console.warn("[PersistenceController] persist failed", err);
    return false;
  }
};

const writeStoreRuntime = (
  store: StorySessionStore,
  next: RuntimeStoryState,
  options: WriteRuntimeOptions,
): RuntimeStoryState => {
  if (options.skipStore) {
    if (options.persist !== false) {
      persistIfAllowed(store, next);
    }
    return next;
  }

  const snapshotBefore = store.getState();
  const targetHydrated = options.hydrated ?? snapshotBefore.hydrated;
  const runtime = snapshotBefore.setRuntime(next, { hydrated: targetHydrated });
  if (options.persist !== false) {
    persistIfAllowed(store, runtime);
  }
  return runtime;
};

export const createPersistenceController = (store: StorySessionStore = storySessionStore): PersistenceController => {
  const setStory = (next: NormalizedStory | null | undefined): RuntimeStoryState => (
    store.getState().setStory(next ?? null)
  );

  const setChatContext = ({ chatId, groupChatSelected }: { chatId: string | null | undefined; groupChatSelected: boolean | null | undefined }) => {
    store.getState().setChatContext({
      chatId: sanitizeChatKey(chatId),
      groupChatSelected: Boolean(groupChatSelected),
    });
  };

  const resetRuntime = (): RuntimeStoryState => (
    store.getState().resetRuntime()
  );

  const hydrate = (): HydrateResult => {
    const snapshot = store.getState();
    if (!snapshot.story || !snapshot.groupChatSelected) {
      const runtime = snapshot.resetRuntime();
      return { runtime, source: "default", storyKey: snapshot.storyKey ?? null };
    }

    const { state, source, storyKey } = loadStoryState({ chatId: snapshot.chatId, story: snapshot.story });
    try {
      snapshot.setStoryKey(storyKey);
    } catch (err) {
      console.warn("[PersistenceController] failed to sync story key during hydrate", err);
    }
    const runtime = writeStoreRuntime(store, state, { hydrated: true, persist: false });
    return { runtime, source, storyKey };
  };

  const writeRuntime = (next: RuntimeStoryState, options: WriteRuntimeOptions = {}): RuntimeStoryState => {
    const snapshot = store.getState();
    const shouldPersist = options.persist !== false && snapshot.groupChatSelected;
    return writeStoreRuntime(store, next, { ...options, persist: shouldPersist, hydrated: options.hydrated ?? (shouldPersist ? true : snapshot.hydrated) });
  };

  const persistRuntimeIfAllowed = (runtime: RuntimeStoryState, persist?: boolean) => {
    if (persist !== false && store.getState().groupChatSelected) persistIfAllowed(store, runtime);
  };

  const setTurnsSinceEval = (next: number, options?: { persist?: boolean }): RuntimeStoryState => {
    const runtime = store.getState().setTurnsSinceEval(next);
    persistRuntimeIfAllowed(runtime, options?.persist);
    return runtime;
  };

  const setCheckpointTurnCount = (next: number, options?: { persist?: boolean }): RuntimeStoryState => {
    const runtime = store.getState().setCheckpointTurnCount(next);
    persistRuntimeIfAllowed(runtime, options?.persist);
    return runtime;
  };

  const updateCheckpointStatus = (index: number, status: CheckpointStatus, options?: { persist?: boolean }): RuntimeStoryState => {
    const runtime = store.getState().updateCheckpointStatus(index, status);
    persistRuntimeIfAllowed(runtime, options?.persist);
    return runtime;
  };

  const dispose = () => {
    /* no-op: store already owns state */
  };

  const canPersist = () => {
    const { story, chatId, groupChatSelected } = store.getState();
    return Boolean(story && chatId && groupChatSelected);
  };

  const isHydrated = () => Boolean(store.getState().hydrated);

  return {
    setStory,
    setChatContext,
    resetRuntime,
    hydrate,
    writeRuntime,
    setTurnsSinceEval,
    setCheckpointTurnCount,
    updateCheckpointStatus,
    dispose,
    canPersist,
    isHydrated,
  };
};

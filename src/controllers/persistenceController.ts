import { storySessionStore } from "@store/storySessionStore";
import type { StorySessionStore } from "@store/storySessionStore";
import type { CheckpointStatus, RuntimeStoryState } from "@utils/story-state";
import { loadStoryState, persistStoryState } from "@utils/story-state";
import type { NormalizedStory } from "@utils/story-validator";

const sanitizeChatId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

interface WriteRuntimeOptions {
  persist?: boolean;
  hydrated?: boolean;
}

interface PersistenceContext {
  story: NormalizedStory | null;
  chatId: string | null;
  groupChatSelected: boolean;
  hydrated: boolean;
}

export interface HydrateResult {
  runtime: RuntimeStoryState;
  source: "stored" | "default";
}

export interface PersistenceController {
  setStory(next: NormalizedStory | null | undefined): RuntimeStoryState;
  setChatContext(ctx: { chatId: string | null | undefined; groupChatSelected: boolean | null | undefined }): void;
  resetRuntime(): RuntimeStoryState;
  hydrate(): HydrateResult;
  writeRuntime(next: RuntimeStoryState, options?: WriteRuntimeOptions): RuntimeStoryState;
  setTurnsSinceEval(next: number, options?: { persist?: boolean }): RuntimeStoryState;
  updateCheckpointStatus(index: number, status: CheckpointStatus, options?: { persist?: boolean }): RuntimeStoryState;
  dispose(): void;
  canPersist(): boolean;
  isHydrated(): boolean;
}

const persistIfAllowed = (ctx: PersistenceContext, runtime: RuntimeStoryState) => {
  if (!ctx.story) return false;
  if (!ctx.groupChatSelected) return false;
  if (!ctx.chatId) return false;
  try {
    persistStoryState({ chatId: ctx.chatId, story: ctx.story, state: runtime });
    return true;
  } catch (err) {
    console.warn("[PersistenceController] persist failed", err);
    return false;
  }
};

const writeStoreRuntime = (
  store: StorySessionStore,
  ctx: PersistenceContext,
  next: RuntimeStoryState,
  options: WriteRuntimeOptions,
): RuntimeStoryState => {
  const nextHydrated = options.hydrated ?? ctx.hydrated;
  const runtime = store.getState().writeRuntime(next, { hydrated: nextHydrated });
  ctx.hydrated = store.getState().hydrated;
  if (options.persist !== false && ctx.hydrated) {
    persistIfAllowed(ctx, runtime);
  }
  return runtime;
};

export const createPersistenceController = (store: StorySessionStore = storySessionStore): PersistenceController => {
  const ctx: PersistenceContext = {
    story: null,
    chatId: null,
    groupChatSelected: false,
    hydrated: false,
  };

  const setStory = (next: NormalizedStory | null | undefined): RuntimeStoryState => {
    ctx.story = next ?? null;
    const runtime = store.getState().setStory(ctx.story);
    ctx.hydrated = store.getState().hydrated;
    return runtime;
  };

  const setChatContext = ({ chatId, groupChatSelected }: { chatId: string | null | undefined; groupChatSelected: boolean | null | undefined }) => {
    ctx.chatId = sanitizeChatId(chatId);
    ctx.groupChatSelected = Boolean(groupChatSelected);
    store.getState().setChatContext({ chatId: ctx.chatId, groupChatSelected: ctx.groupChatSelected });
  };

  const resetRuntime = (): RuntimeStoryState => {
    const runtime = store.getState().resetRuntime();
    ctx.hydrated = store.getState().hydrated;
    return runtime;
  };

  const hydrate = (): HydrateResult => {
    if (!ctx.story || !ctx.groupChatSelected) {
      const runtime = resetRuntime();
      return { runtime, source: "default" };
    }

    const { state, source } = loadStoryState({ chatId: ctx.chatId, story: ctx.story });
    const runtime = writeStoreRuntime(store, ctx, state, { hydrated: true, persist: false });
    ctx.hydrated = true;
    return { runtime, source };
  };

  const writeRuntime = (next: RuntimeStoryState, options: WriteRuntimeOptions = {}): RuntimeStoryState => {
    if (options.persist !== false && ctx.groupChatSelected) {
      options.hydrated ??= true;
    }
    const runtime = writeStoreRuntime(store, ctx, next, options);
    return runtime;
  };

  const setTurnsSinceEval = (next: number, options?: { persist?: boolean }): RuntimeStoryState => {
    const runtime = store.getState().setTurnsSinceEval(next);
    ctx.hydrated = store.getState().hydrated;
    if (options?.persist !== false && ctx.hydrated) {
      persistIfAllowed(ctx, runtime);
    }
    return runtime;
  };

  const updateCheckpointStatus = (index: number, status: CheckpointStatus, options?: { persist?: boolean }): RuntimeStoryState => {
    const runtime = store.getState().updateCheckpointStatus(index, status);
    ctx.hydrated = store.getState().hydrated;
    if (options?.persist !== false && ctx.hydrated) {
      persistIfAllowed(ctx, runtime);
    }
    return runtime;
  };

  const dispose = () => {
    ctx.story = null;
    ctx.chatId = null;
    ctx.groupChatSelected = false;
    ctx.hydrated = false;
  };

  const canPersist = () => Boolean(ctx.story && ctx.chatId && ctx.groupChatSelected);
  const isHydrated = () => ctx.hydrated;

  return {
    setStory,
    setChatContext,
    resetRuntime,
    hydrate,
    writeRuntime,
    setTurnsSinceEval,
    updateCheckpointStatus,
    dispose,
    canPersist,
    isHydrated,
  };
};

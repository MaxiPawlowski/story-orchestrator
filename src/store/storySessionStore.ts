import { createStore, type StoreApi } from "zustand/vanilla";
import type { NormalizedStory } from "@utils/story-validator";
import {
  makeDefaultState,
  sanitizeTurnsSinceEval,
  sanitizeRuntime,
  type RuntimeStoryState,
  CheckpointStatus,
  checkpointKeyAtIndex,
  deriveCheckpointStatuses,
  isCheckpointStatus,
  type CheckpointStatusMap,
  sanitizeChatKey,
} from "@utils/story-state";
import { createRequirementsState, cloneRequirementsState, type StoryRequirementsState } from "./requirementsState";

export interface StorySessionValueState {
  story: NormalizedStory | null;
  storyKey: string | null;
  chatId: string | null;
  groupChatSelected: boolean;
  runtime: RuntimeStoryState;
  turn: number;
  hydrated: boolean;
  requirements: StoryRequirementsState;
  orchestratorReady: boolean;
}

export interface StorySessionActions {
  setStory: (story: NormalizedStory | null) => RuntimeStoryState;
  setStoryKey: (key: string | null) => string | null;
  setChatContext: (ctx: { chatId: string | null; groupChatSelected: boolean }) => void;
  resetRuntime: () => RuntimeStoryState;
  setRuntime: (next: RuntimeStoryState, options?: { hydrated?: boolean }) => RuntimeStoryState;
  writeRuntime: (next: RuntimeStoryState, options?: { hydrated?: boolean }) => RuntimeStoryState;
  setTurnsSinceEval: (next: number) => RuntimeStoryState;
  setCheckpointTurnCount: (next: number) => RuntimeStoryState;
  updateCheckpointStatus: (index: number, status: CheckpointStatus) => RuntimeStoryState;
  setTurn: (value: number) => number;
  setRequirementsState: (next: StoryRequirementsState) => StoryRequirementsState;
  resetRequirements: () => StoryRequirementsState;
  setOrchestratorReady: (next: boolean) => boolean;
}

export type StorySessionStore = StoreApi<StorySessionValueState & StorySessionActions>;


export const storySessionStore: StorySessionStore = createStore<StorySessionValueState & StorySessionActions>((set, get) => ({
  story: null,
  storyKey: null,
  chatId: null,
  groupChatSelected: false,
  runtime: makeDefaultState(null),
  turn: 0,
  hydrated: false,
  requirements: createRequirementsState(),
  orchestratorReady: false,

  setStory: (story) => {
    const runtime = makeDefaultState(story);
    set(() => ({
      story: story ?? null,
      runtime,
      turn: 0,
      hydrated: false,
    }));
    return runtime;
  },

  setStoryKey: (key) => {
    const normalized = typeof key === "string" ? key.trim() : null;
    const value = normalized ? normalized : null;
    if (get().storyKey === value) return value;
    set({ storyKey: value });
    return value;
  },

  setChatContext: ({ chatId, groupChatSelected }) => {
    set(() => ({
      chatId: sanitizeChatKey(chatId),
      groupChatSelected: Boolean(groupChatSelected),
    }));
  },

  resetRuntime: () => {
    const runtime = makeDefaultState(get().story);
    set({ runtime, turn: 0, hydrated: false });
    return runtime;
  },

  setRuntime: (nextRuntime, options) => {
    const sanitized = sanitizeRuntime(nextRuntime, get().story);
    const nextHydrated = options?.hydrated ?? get().hydrated;
    set({ runtime: sanitized, hydrated: nextHydrated });
    return sanitized;
  },

  writeRuntime: (nextRuntime, options) => { // deprecated alias
    return get().setRuntime(nextRuntime, options);
  },

  setTurnsSinceEval: (next) => {
    const current = get().runtime;
    const sanitized = sanitizeTurnsSinceEval(next);
    if (sanitized === current.turnsSinceEval) return current;
    const updated: RuntimeStoryState = {
      ...current,
      turnsSinceEval: sanitized,
    };
    return get().writeRuntime(updated);
  },

  setCheckpointTurnCount: (next) => {
    const current = get().runtime;
    const sanitized = sanitizeTurnsSinceEval(next);
    if (sanitized === current.checkpointTurnCount) return current;
    const updated: RuntimeStoryState = {
      ...current,
      checkpointTurnCount: sanitized,
    };
    const result = get().writeRuntime(updated);
    if (get().turn < sanitized) {
      get().setTurn(sanitized);
    }
    return result;
  },

  updateCheckpointStatus: (index, status) => {
    if (!isCheckpointStatus(status)) return get().runtime;
    const snapshot = get();
    const runtime = snapshot.runtime;
    const story = snapshot.story;
    const checkpoints = story?.checkpoints ?? [];
    if (!checkpoints.length) return runtime;
    if (index < 0 || index >= checkpoints.length) return runtime;

    const key = checkpointKeyAtIndex(story, index);
    const currentStatuses = deriveCheckpointStatuses(story, runtime);
    const currentStatus = currentStatuses[index];
    if (currentStatus === status) return runtime;

    const nextMap: CheckpointStatusMap = { ...runtime.checkpointStatusMap };
    nextMap[key] = status;

    return get().setRuntime({ ...runtime, checkpointStatusMap: nextMap });
  },

  setTurn: (value) => {
    const sanitized = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    set({ turn: sanitized });
    return sanitized;
  },

  setRequirementsState: (next) => {
    const cloned = cloneRequirementsState(next);
    set({ requirements: cloned });
    return cloned;
  },

  resetRequirements: () => {
    const defaults = createRequirementsState();
    set({ requirements: defaults });
    return defaults;
  },

  setOrchestratorReady: (next) => {
    const normalized = Boolean(next);
    if (get().orchestratorReady === normalized) return normalized;
    set({ orchestratorReady: normalized });
    return normalized;
  },
}));

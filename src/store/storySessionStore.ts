import { createStore, type StoreApi } from "zustand/vanilla";
import type { NormalizedStory } from "@utils/story-validator";
import {
  clampCheckpointIndex,
  makeDefaultState,
  sanitizeTurnsSinceEval,
  type RuntimeStoryState,
  type CheckpointStatus,
} from "@utils/story-state";
import {
  createRequirementsState,
  cloneRequirementsState,
  type StoryRequirementsState,
} from "./requirementsState";

export interface StorySessionValueState {
  story: NormalizedStory | null;
  chatId: string | null;
  groupChatSelected: boolean;
  runtime: RuntimeStoryState;
  hydrated: boolean;
  requirements: StoryRequirementsState;
  orchestratorReady: boolean;
}

export interface StorySessionActions {
  setStory: (story: NormalizedStory | null) => RuntimeStoryState;
  setChatContext: (ctx: { chatId: string | null; groupChatSelected: boolean }) => void;
  resetRuntime: () => RuntimeStoryState;
  writeRuntime: (next: RuntimeStoryState, options?: { hydrated?: boolean }) => RuntimeStoryState;
  setTurnsSinceEval: (next: number) => RuntimeStoryState;
  updateCheckpointStatus: (index: number, status: CheckpointStatus) => RuntimeStoryState;
  setRequirementsState: (next: StoryRequirementsState) => StoryRequirementsState;
  resetRequirements: () => StoryRequirementsState;
  setOrchestratorReady: (next: boolean) => boolean;
}

export type StorySessionStore = StoreApi<StorySessionValueState & StorySessionActions>;

const sanitizeChatId = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const isValidStatus = (value: unknown): value is CheckpointStatus => (
  value === "pending"
  || value === "current"
  || value === "complete"
  || value === "failed"
);

const normalizeStatuses = (
  source: CheckpointStatus[] | null | undefined,
  story: NormalizedStory | null,
  activeIndex: number,
): CheckpointStatus[] => {
  const total = story?.checkpoints?.length ?? (Array.isArray(source) ? source.length : 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const result: CheckpointStatus[] = Array.from({ length: total }, () => "pending");

  if (Array.isArray(source)) {
    for (let i = 0; i < total && i < source.length; i++) {
      const status = source[i];
      if (isValidStatus(status)) {
        result[i] = status;
      }
    }
  }

  for (let i = 0; i < total; i++) {
    if (i < activeIndex && result[i] === "pending") {
      result[i] = "complete";
    }
    if (i === activeIndex && result[i] !== "failed") {
      result[i] = "current";
    }
  }

  return result;
};

const sanitizeRuntime = (candidate: RuntimeStoryState, story: NormalizedStory | null): RuntimeStoryState => {
  const checkpointIndex = clampCheckpointIndex(candidate.checkpointIndex, story);
  const turnsSinceEval = sanitizeTurnsSinceEval(candidate.turnsSinceEval);
  const checkpointStatuses = normalizeStatuses(candidate.checkpointStatuses, story, checkpointIndex);
  return {
    checkpointIndex,
    checkpointStatuses,
    turnsSinceEval,
  };
};

export const storySessionStore: StorySessionStore = createStore<StorySessionValueState & StorySessionActions>((set, get) => ({
  story: null,
  chatId: null,
  groupChatSelected: false,
  runtime: makeDefaultState(null),
  hydrated: false,
  requirements: createRequirementsState(),
  orchestratorReady: false,

  setStory: (story) => {
    const runtime = makeDefaultState(story);
    set(() => ({
      story: story ?? null,
      runtime,
      hydrated: false,
    }));
    return runtime;
  },

  setChatContext: ({ chatId, groupChatSelected }) => {
    set(() => ({
      chatId: sanitizeChatId(chatId),
      groupChatSelected: Boolean(groupChatSelected),
    }));
  },

  resetRuntime: () => {
    const runtime = makeDefaultState(get().story);
    set({ runtime, hydrated: false });
    return runtime;
  },

  writeRuntime: (nextRuntime, options) => {
    const sanitized = sanitizeRuntime(nextRuntime, get().story);
    const nextHydrated = options?.hydrated ?? get().hydrated;
    set({ runtime: sanitized, hydrated: nextHydrated });
    return sanitized;
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

  updateCheckpointStatus: (index, status) => {
    if (!isValidStatus(status)) return get().runtime;
    const snapshot = get();
    const total = snapshot.story?.checkpoints?.length ?? snapshot.runtime.checkpointStatuses.length;
    if (index < 0 || index >= total) return snapshot.runtime;

    const nextStatuses = snapshot.runtime.checkpointStatuses.slice();
    nextStatuses[index] = status;

    const updated: RuntimeStoryState = {
      ...snapshot.runtime,
      checkpointStatuses: normalizeStatuses(nextStatuses, snapshot.story, snapshot.runtime.checkpointIndex),
    };

    return get().writeRuntime(updated);
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

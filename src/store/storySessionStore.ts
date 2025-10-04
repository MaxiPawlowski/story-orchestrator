import { createStore, type StoreApi } from "zustand/vanilla";
import type { NormalizedStory } from "@utils/story-validator";
import { type StoryRequirementsState, DEFAULT_REQUIREMENTS_STATE } from "./requirementsState";
import {
  clampCheckpointIndex,
  makeDefaultState,
  persistStoryState,
  loadStoryState,
  sanitizeTurnsSinceEval,
  type RuntimeStoryState,
  type CheckpointStatus,
} from "@utils/story-state";

export interface StorySessionValueState {
  story: NormalizedStory | null;
  chatId: string | null;
  groupChatSelected: boolean;
  runtime: RuntimeStoryState;
  hydrated: boolean;
  requirements: StoryRequirementsState;
}

export interface StorySessionActions {
  setStory: (story: NormalizedStory | null) => RuntimeStoryState;
  setChatContext: (ctx: { chatId: string | null; groupChatSelected: boolean }) => void;
  hydrate: () => { runtime: RuntimeStoryState; hydrated: boolean; source: "stored" | "default" };
  resetRuntime: () => RuntimeStoryState;
  writeRuntime: (next: RuntimeStoryState, options?: { persist?: boolean; hydrated?: boolean }) => RuntimeStoryState;
  setTurnsSinceEval: (next: number) => RuntimeStoryState;
  updateCheckpointStatus: (index: number, status: CheckpointStatus) => RuntimeStoryState;
  setRequirementsState: (next: StoryRequirementsState) => StoryRequirementsState;
  resetRequirements: () => StoryRequirementsState;
}

export type StorySessionStore = StoreApi<StorySessionValueState & StorySessionActions>;

function cloneRequirements(state: StoryRequirementsState): StoryRequirementsState {
  return {
    ...state,
    worldLoreMissing: state.worldLoreMissing.slice(),
    missingRoles: state.missingRoles.slice(),
  };
}

const createDefaultRequirementsState = (): StoryRequirementsState => cloneRequirements(DEFAULT_REQUIREMENTS_STATE);

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

const shouldPersist = (state: StorySessionValueState): state is StorySessionValueState & { story: NormalizedStory; chatId: string } => (
  Boolean(state.hydrated)
  && Boolean(state.story)
  && Boolean(state.groupChatSelected)
  && typeof state.chatId === "string"
  && state.chatId.trim().length > 0
);

export const storySessionStore: StorySessionStore = createStore<StorySessionValueState & StorySessionActions>((set, get) => ({
  story: null,
  chatId: null,
  groupChatSelected: false,
  runtime: makeDefaultState(null),
  hydrated: false,
  requirements: createDefaultRequirementsState(),

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

  hydrate: () => {
    const state = get();
    if (!state.story || !state.groupChatSelected) {
      const runtime = makeDefaultState(state.story);
      set({ runtime, hydrated: false });
      return { runtime, hydrated: false, source: "default" as const };
    }

    try {
      const hydrated = loadStoryState({ chatId: state.chatId, story: state.story });
      const sanitized = sanitizeRuntime(hydrated.state, state.story);
      set({ runtime: sanitized, hydrated: true });
      return { runtime: sanitized, hydrated: true, source: hydrated.source };
    } catch (err) {
      console.warn("[StorySessionStore] hydrate failed", err);
      const runtime = makeDefaultState(state.story);
      set({ runtime, hydrated: false });
      return { runtime, hydrated: false, source: "default" as const };
    }
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

    if (options?.persist !== false) {
      const snapshot = get();
      const candidate = { ...snapshot, hydrated: nextHydrated };
      if (shouldPersist(candidate)) {
        try {
          persistStoryState({ chatId: candidate.chatId, story: candidate.story, state: sanitized });
        } catch (err) {
          console.warn("[StorySessionStore] persist failed", err);
        }
      }
    }

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
    const cloned = cloneRequirements(next);
    set({ requirements: cloned });
    return cloned;
  },

  resetRequirements: () => {
    const defaults = createDefaultRequirementsState();
    set({ requirements: defaults });
    return defaults;
  },
}));
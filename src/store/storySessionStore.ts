import { createStore, type StoreApi } from "zustand/vanilla";
import type { NormalizedStory } from "@utils/story-validator";
import {
  makeDefaultState,
  sanitizeTurnsSinceEval,
  sanitizeRuntime,
  type RuntimeStoryState,
  CheckpointStatus,
  isCheckpointStatus,
  type CheckpointStatusMap,
  sanitizeChatKey,
  loadStoryState,
  persistStoryState,
  canPersistRuntimeState,
} from "@utils/story-state";
import { createRequirementsState, cloneRequirementsState, type StoryRequirementsState } from "./requirementsState";
import type { GenerationPhase } from "@services/StoryGeneratorService";

export interface ExpansionPreview {
  checkpointName: string;
  checkpointObjective: string;
  transitionCount: number;
}

export interface ExpansionState {
  isExpanding: boolean;
  phase: GenerationPhase | null;
  phaseDone: Partial<Record<GenerationPhase, boolean>>;
  preview: ExpansionPreview | null;
}

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
  expansion: ExpansionState;
  roadmap: string | null;
}

export interface RuntimeWriteOptions {
  persist?: boolean;
  hydrated?: boolean;
}

export interface StorySelectionOptions {
  storyKey?: string | null;
  roadmap?: string | null;
}

export interface RoadmapWriteOptions {
  persist?: boolean;
  story?: NormalizedStory | null;
  storyKey?: string | null;
}

export interface RuntimeHydrateResult {
  runtime: RuntimeStoryState;
  source: "stored" | "default";
  storyKey: string | null;
}

export interface StorySessionActions {
  setStory: (story: NormalizedStory | null) => RuntimeStoryState;
  selectStory: (story: NormalizedStory | null, options?: StorySelectionOptions) => RuntimeStoryState;
  setStoryKey: (key: string | null) => string | null;
  setChatContext: (ctx: { chatId: string | null; groupChatSelected: boolean }) => void;
  resetRuntime: (options?: RuntimeWriteOptions) => RuntimeStoryState;
  hydrateRuntime: () => RuntimeHydrateResult;
  writeRuntime: (next: RuntimeStoryState, options?: RuntimeWriteOptions) => RuntimeStoryState;
  setTurnsSinceEval: (next: number, options?: RuntimeWriteOptions) => RuntimeStoryState;
  setCheckpointTurnCount: (next: number, options?: RuntimeWriteOptions) => RuntimeStoryState;
  updateCheckpointStatus: (index: number, status: CheckpointStatus, options?: RuntimeWriteOptions) => RuntimeStoryState;
  canPersistRuntime: () => boolean;
  setTurn: (value: number) => number;
  setRequirementsState: (next: StoryRequirementsState) => StoryRequirementsState;
  resetRequirements: () => StoryRequirementsState;
  setOrchestratorReady: (next: boolean) => boolean;
  setExpansion: (next: Partial<ExpansionState>) => void;
  resetExpansion: () => void;
  setRoadmap: (roadmap: string | null, options?: RoadmapWriteOptions) => void;
}

export type StorySessionStore = StoreApi<StorySessionValueState & StorySessionActions>;


const defaultExpansionState: ExpansionState = {
  isExpanding: false,
  phase: null,
  phaseDone: {},
  preview: null,
};

const updateRuntimeCounter = (
  current: RuntimeStoryState,
  key: "turnsSinceEval" | "checkpointTurnCount",
  next: number,
): RuntimeStoryState | null => {
  const sanitized = sanitizeTurnsSinceEval(next);
  if (sanitized === current[key]) return null;
  return {
    ...current,
    [key]: sanitized,
  };
};

const persistSnapshotRuntime = (
  snapshot: Pick<StorySessionValueState, "story" | "chatId" | "groupChatSelected" | "storyKey" | "roadmap">,
  runtime: RuntimeStoryState,
  overrides?: {
    story?: NormalizedStory | null;
    storyKey?: string | null;
    roadmap?: string | null;
  },
) => {
  const story = overrides?.story !== undefined ? overrides.story : snapshot.story;
  const storyKey = overrides?.storyKey !== undefined ? overrides.storyKey : snapshot.storyKey;
  const roadmap = overrides?.roadmap !== undefined ? overrides.roadmap : snapshot.roadmap;
  if (!canPersistRuntimeState({ ...snapshot, story })) return false;
  try {
    persistStoryState({
      chatId: snapshot.chatId,
      story,
      state: runtime,
      storyKey,
      roadmap: roadmap ?? undefined,
    });
    return true;
  } catch (err) {
    console.warn("[Story - Store] persist failed", err);
    return false;
  }
};

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
  expansion: { ...defaultExpansionState },
  roadmap: null,

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

  selectStory: (story, options) => {
    const snapshot = get();
    const storyKey = typeof options?.storyKey === "string" ? options.storyKey.trim() || null : (options?.storyKey ?? snapshot.storyKey);
    const roadmap = options?.roadmap ?? null;
    const runtime = makeDefaultState(story);

    set(() => ({
      story: story ?? null,
      storyKey,
      runtime,
      roadmap,
      turn: 0,
      hydrated: false,
    }));

    persistSnapshotRuntime(get(), runtime);
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

  resetRuntime: (options) => {
    const runtime = makeDefaultState(get().story);
    set({ turn: 0 });
    return get().writeRuntime(runtime, {
      hydrated: options?.hydrated ?? false,
      persist: options?.persist,
    });
  },

  hydrateRuntime: () => {
    const snapshot = get();
    if (!snapshot.story || !snapshot.groupChatSelected) {
      const runtime = snapshot.resetRuntime();
      return { runtime, source: "default", storyKey: snapshot.storyKey ?? null };
    }

    const { state, source, storyKey, roadmap } = loadStoryState({
      chatId: snapshot.chatId,
      story: snapshot.story,
    });

    snapshot.setStoryKey(storyKey);
    get().setRoadmap(roadmap ?? null, { persist: false });

    const runtime = get().writeRuntime(state, { hydrated: true, persist: false });
    return { runtime, source, storyKey };
  },

  writeRuntime: (nextRuntime, options) => {
    const snapshot = get();
    const sanitized = sanitizeRuntime(nextRuntime, snapshot.story);
    const shouldPersist = options?.persist !== false && canPersistRuntimeState(snapshot);
    const nextHydrated = options?.hydrated ?? (shouldPersist ? true : snapshot.hydrated);
    set({ runtime: sanitized, hydrated: nextHydrated });
    if (shouldPersist) {
      persistSnapshotRuntime(get(), sanitized);
    }
    return sanitized;
  },

  setTurnsSinceEval: (next, options) => {
    const current = get().runtime;
    const updated = updateRuntimeCounter(current, "turnsSinceEval", next);
    if (!updated) return current;
    return get().writeRuntime(updated, options);
  },

  setCheckpointTurnCount: (next, options) => {
    const current = get().runtime;
    const updated = updateRuntimeCounter(current, "checkpointTurnCount", next);
    if (!updated) return current;
    const result = get().writeRuntime(updated, options);
    if (get().turn < updated.checkpointTurnCount) {
      get().setTurn(updated.checkpointTurnCount);
    }
    return result;
  },

  updateCheckpointStatus: (index, status, options) => {
    if (!isCheckpointStatus(status)) return get().runtime;
    const snapshot = get();
    const runtime = snapshot.runtime;
    const story = snapshot.story;
    const checkpoints = story?.checkpoints ?? [];
    if (!checkpoints.length) return runtime;
    if (index < 0 || index >= checkpoints.length) return runtime;

    const key = checkpoints[index]?.id;
    if (!key || runtime.checkpointStatusMap[key] === status) return runtime;

    const nextMap: CheckpointStatusMap = { ...runtime.checkpointStatusMap };
    nextMap[key] = status;

    return get().writeRuntime({ ...runtime, checkpointStatusMap: nextMap }, options);
  },

  canPersistRuntime: () => {
    return canPersistRuntimeState(get());
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

  setExpansion: (next) => {
    const current = get().expansion;
    set({ expansion: { ...current, ...next } });
  },

  resetExpansion: () => {
    set({ expansion: { ...defaultExpansionState } });
  },

  setRoadmap: (roadmap, options) => {
    const normalizedRoadmap = roadmap ?? null;
    const nextStory = options?.story === undefined ? undefined : (options.story ?? null);
    const nextStoryKey = options?.storyKey === undefined
      ? undefined
      : (typeof options.storyKey === "string" ? options.storyKey.trim() || null : null);
    const snapshot = get();
    const story = nextStory === undefined ? snapshot.story : nextStory;
    const runtime = nextStory === undefined ? snapshot.runtime : sanitizeRuntime(snapshot.runtime, story);

    set({
      roadmap: normalizedRoadmap,
      ...(nextStory === undefined ? {} : { story, runtime }),
      ...(nextStoryKey === undefined ? {} : { storyKey: nextStoryKey }),
    });

    if (options?.persist !== false) {
      persistSnapshotRuntime(get(), runtime, {
        story,
        storyKey: nextStoryKey,
        roadmap: normalizedRoadmap,
      });
    }
  },
}));

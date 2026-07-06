import { create } from "zustand";
import { isValidationErrorList, parseStoryV2, type StoryV2, type ValidationError } from "@engine/index";
import { runDiagnostics, type Diagnostic } from "./diagnostics";

export type StoryDraft = StoryV2;

export const newStoryDraft = (): StoryDraft => ({
  format: 2,
  title: "Untitled Story",
  description: "",
  qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const validate = (draft: StoryDraft): ValidationError[] => {
  const parsed = parseStoryV2(draft);
  return isValidationErrorList(parsed) ? parsed : [];
};

const derive = (draft: StoryDraft, baseline: StoryDraft) => ({
  errors: validate(draft),
  diagnostics: runDiagnostics(draft),
  dirty: JSON.stringify(draft) !== JSON.stringify(baseline),
});

const clampSelection = (draft: StoryDraft, selectedCheckpointId: string | null, selectedTransitionIndex: number | null) => ({
  selectedCheckpointId: selectedCheckpointId && draft.checkpoints.some((entry) => entry.id === selectedCheckpointId) ? selectedCheckpointId : draft.checkpoints[0]?.id ?? null,
  selectedTransitionIndex: selectedTransitionIndex !== null && selectedTransitionIndex < draft.transitions.length ? selectedTransitionIndex : null,
});

export interface DraftState {
  draft: StoryDraft;
  baseline: StoryDraft;
  sourceHash: string | null;
  past: StoryDraft[];
  future: StoryDraft[];
  errors: ValidationError[];
  diagnostics: Diagnostic[];
  dirty: boolean;
  selectedCheckpointId: string | null;
  selectedTransitionIndex: number | null;
}

export interface DraftActions {
  mutate: (fn: (draft: StoryDraft) => StoryDraft, options?: { history?: boolean }) => void;
  loadDraft: (draft: StoryDraft, sourceHash?: string | null) => void;
  newDraft: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  selectCheckpoint: (id: string | null) => void;
  selectTransition: (index: number | null) => void;
}

export type DraftStore = DraftState & DraftActions;

const initialData = (draft: StoryDraft, baseline: StoryDraft = draft): DraftState => ({
  draft,
  baseline: clone(baseline),
  sourceHash: null,
  past: [],
  future: [],
  selectedCheckpointId: draft.checkpoints[0]?.id ?? null,
  selectedTransitionIndex: null,
  ...derive(draft, baseline),
});

export const useDraftStore = create<DraftStore>((set, get) => ({
  ...initialData(newStoryDraft()),
  mutate: (fn, options) => set((state) => {
    const next = fn(state.draft);
    if (next === state.draft) return {};
    const keepHistory = options?.history !== false;
    return {
      draft: next,
      past: keepHistory ? [...state.past, state.draft] : state.past,
      future: keepHistory ? [] : state.future,
      ...derive(next, state.baseline),
    };
  }),
  loadDraft: (draft, sourceHash = null) => set(() => ({
    ...initialData(draft),
    sourceHash,
  })),
  newDraft: () => get().loadDraft(newStoryDraft()),
  undo: () => set((state) => {
    if (!state.past.length) return {};
    const previous = state.past[state.past.length - 1];
    return {
      draft: previous,
      past: state.past.slice(0, -1),
      future: [state.draft, ...state.future],
      ...clampSelection(previous, state.selectedCheckpointId, state.selectedTransitionIndex),
      ...derive(previous, state.baseline),
    };
  }),
  redo: () => set((state) => {
    if (!state.future.length) return {};
    const [next, ...rest] = state.future;
    return {
      draft: next,
      past: [...state.past, state.draft],
      future: rest,
      ...clampSelection(next, state.selectedCheckpointId, state.selectedTransitionIndex),
      ...derive(next, state.baseline),
    };
  }),
  reset: () => set((state) => {
    const restored = clone(state.baseline);
    return {
      draft: restored,
      past: [],
      future: [],
      ...clampSelection(restored, state.selectedCheckpointId, null),
      ...derive(restored, state.baseline),
    };
  }),
  selectCheckpoint: (id) => set({ selectedCheckpointId: id }),
  selectTransition: (index) => set({ selectedTransitionIndex: index }),
}));

export const resetDraftStore = (): void => useDraftStore.getState().newDraft();

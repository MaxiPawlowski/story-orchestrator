import { create } from "zustand";
import { isValidationErrorList, parseStoryV2, type StoryV2, type ValidationError } from "@engine/index";
import { wizardSessionKey } from "@wizard/index";
import { runDiagnostics, type Diagnostic, type DiagnosticsContext } from "./diagnostics";

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

export const freshDraftKey = (): string => `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const draftKeyFor = (draft: StoryDraft): string => (draft.id ? wizardSessionKey({ id: draft.id }) : freshDraftKey());

export const changedFields = (from: StoryDraft, to: StoryDraft): string[] => {
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])] as Array<keyof StoryDraft>;
  return keys.filter((key) => JSON.stringify(from[key]) !== JSON.stringify(to[key]));
};

const undoNote = (verb: "Undo" | "Redo", from: StoryDraft, to: StoryDraft): string => {
  const fields = changedFields(from, to);
  return `The author pressed ${verb}, which changed ${fields.length ? fields.join(", ") : "nothing visible"} in the draft behind your last steps. Read the draft again before relying on them.`;
};

const validate = (draft: StoryDraft): ValidationError[] => {
  const parsed = parseStoryV2(draft);
  return isValidationErrorList(parsed) ? parsed : [];
};

let diagnosticsContext: DiagnosticsContext = {};

const derive = (draft: StoryDraft, baseline: StoryDraft) => ({
  errors: validate(draft),
  diagnostics: runDiagnostics(draft, diagnosticsContext),
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
  runEpoch: number;
  draftKey: string;
  undone: string[];
}

export interface DraftActions {
  endRuns: () => void;
  mutate: (fn: (draft: StoryDraft) => StoryDraft, options?: { history?: boolean }) => void;
  loadDraft: (draft: StoryDraft, sourceHash?: string | null, draftKey?: string) => void;
  takeUndone: () => string[];
  newDraft: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  selectCheckpoint: (id: string | null) => void;
  selectTransition: (index: number | null) => void;
}

export type DraftStore = DraftState & DraftActions;

const initialData = (draft: StoryDraft, baseline: StoryDraft = draft): Omit<DraftState, "runEpoch" | "draftKey" | "undone"> => ({
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
  runEpoch: 0,
  draftKey: freshDraftKey(),
  undone: [],
  endRuns: () => set((state) => ({ runEpoch: state.runEpoch + 1 })),
  mutate:(fn, options) => set((state) => {
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
  loadDraft: (draft, sourceHash = null, draftKey) => set((state) => ({
    ...initialData(draft),
    sourceHash,
    runEpoch: state.runEpoch + 1,
    draftKey: draftKey ?? draftKeyFor(draft),
    undone: [],
  })),
  takeUndone: () => {
    const { undone } = get();
    if (undone.length) set({ undone: [] });
    return undone;
  },
  newDraft: () => get().loadDraft(newStoryDraft()),
  undo: () => set((state) => {
    if (!state.past.length) return {};
    const previous = state.past[state.past.length - 1];
    return {
      draft: previous,
      runEpoch: state.runEpoch + 1,
      undone: [...state.undone, undoNote("Undo", state.draft, previous)],
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
      runEpoch: state.runEpoch + 1,
      undone: [...state.undone, undoNote("Redo", state.draft, next)],
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
      runEpoch: state.runEpoch + 1,
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

/** D: the install facts diagnostics read. Set when the Studio opens; re-derives the open draft. */
export const setDiagnosticsContext = (context: DiagnosticsContext): void => {
  diagnosticsContext = context;
  useDraftStore.setState((state) => ({ diagnostics: runDiagnostics(state.draft, diagnosticsContext) }));
};

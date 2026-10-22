import type { BoundaryResult, EngineState, NormalizedStory, StoryEngine } from "@engine/index";
import type { PatternKind } from "@engine/patternSchema";
import { isRecord } from "@utils/guards";
import type { RecapLine } from "./consequences";
import type { RecapOutcome } from "./recapPort";
import type { LoadedStory, RuntimeExtras } from "./types";

export interface PatternCursor {
  boundary: number;
  index: number;
}

export interface PatternRef extends PatternCursor {
  kind: PatternKind;
  id: string;
  messageId: number;
}

export interface PatternBranch {
  patternId: string;
  rev: string;
  next: number;
  bindings: Record<string, string>;
  refs: PatternRef[];
}

export type PatternKillReason = "unless" | "expired" | "overflow";

export interface PatternKill {
  patternId: string;
  rev: string;
  reason: PatternKillReason;
  ref: PatternCursor;
  next: number;
  boundary: number;
}

export interface PatternCompletion {
  patternId: string;
  rev: string;
  occurrence: string;
  refs: PatternRef[];
  boundary: number;
  messageId: number;
  label?: string;
  hint?: string;
}

export interface PatternTombstone {
  patternId: string;
  rev: string;
  occurrence: string;
  boundary: number;
}

export interface PatternDelta {
  boundary: number;
  added: PatternBranch[];
  removed: string[];
  killed: PatternKill[];
  overflow: number;
}

export interface PatternGap {
  from: number;
  to: number;
  reason: "kit" | "off" | "history";
}

export interface PatternBase {
  at: PatternCursor;
  branches: PatternBranch[];
  ring: PatternKill[];
  overflow: number;
}

export interface PatternsState {
  base: PatternBase;
  deltas: PatternDelta[];
  tombstones: PatternTombstone[];
  completed: PatternCompletion[];
  gaps: PatternGap[];
  partial: string[];
}

export interface PatternEvidence {
  kind: PatternKind;
  id: string;
  boundary: number;
  index: number;
  messageId: number;
}

export interface PublicPattern {
  patternId: string;
  rev: string;
  phase: "pending" | "completed";
  text: string;
  evidence: PatternEvidence[];
  boundary: number;
}

export interface PatternResting {
  enabled: readonly string[];
  restates: (text: string) => boolean;
}

export interface PatternAuthorRow {
  patternId: string;
  rev: string;
  next: number;
  of: number;
  nextStep: string;
  refs: string[];
  bindings: string;
}

export interface PatternAuthorSlice {
  live: PatternAuthorRow[];
  ended: Array<{ patternId: string; reason: PatternKillReason; at: string; next: number }>;
  completed: Array<{ patternId: string; boundary: number; messageId: number; refs: string[]; text: string | null; withheld: boolean }>;
  overflow: number;
  withheldSecret: number;
  gaps: PatternGap[];
  partial: string[];
}

declare module "./types" {
  interface RuntimeExtras {
    patterns?: PatternsState;
  }
  interface RuntimeSnapshot {
    patterns?: PublicPattern[];
    patternsAuthor?: PatternAuthorSlice | null;
    patternsUnavailable?: boolean;
  }
}

export const PATTERN_COMPLETED_CAP = 200;
export const PATTERN_RING_CAP = 50;
export const PATTERN_GAPS_CAP = 50;

type PatternsKit = typeof import("./patterns");

let kit: PatternsKit | null = null;

export const loadPatternsKit = async (): Promise<PatternsKit> => (kit ??= await import("./patterns"));

export const createPatterns = (): PatternsState => ({
  base: { at: { boundary: 0, index: 0 }, branches: [], ring: [], overflow: 0 }, deltas: [], tombstones: [], completed: [], gaps: [], partial: [],
});

const isState = (value: unknown): value is PatternsState => isRecord(value) && isRecord(value.base) && isRecord(value.base.at) && Array.isArray(value.deltas);

export const sanitizePatterns = (value: unknown): PatternsState | undefined => (kit ? kit.sanitizeState(value) : isState(value) ? value : undefined);

export const addGap = (state: PatternsState, boundary: number, reason: PatternGap["reason"]): PatternsState => {
  const last = state.gaps.at(-1);
  if (last && last.reason === reason && last.to >= boundary - 1 && last.from <= boundary) {
    return last.to >= boundary ? state : { ...state, gaps: [...state.gaps.slice(0, -1), { ...last, to: boundary }] };
  }
  return { ...state, gaps: [...state.gaps, { from: boundary, to: boundary, reason }].slice(-PATTERN_GAPS_CAP) };
};

export const rollbackPatterns = (state: PatternsState | undefined, boundary: number): PatternsState | undefined => {
  if (!state) return state;
  const later = (entry: { boundary: number }) => entry.boundary > boundary;
  const gapsMoved = state.gaps.some((gap) => gap.to > boundary);
  const unreachable = state.base.at.boundary > boundary + 1;
  if (!state.deltas.some(later) && !state.completed.some(later) && !state.tombstones.some(later) && !gapsMoved && !unreachable) return state;
  const gaps = state.gaps.filter((gap) => gap.from <= boundary).map((gap) => (gap.to > boundary ? { ...gap, to: boundary } : gap));
  const next: PatternsState = {
    ...state, deltas: state.deltas.filter((entry) => !later(entry)), completed: state.completed.filter((entry) => !later(entry)),
    tombstones: state.tombstones.filter((entry) => !later(entry)), gaps,
  };
  return unreachable ? { ...next, gaps: [...gaps, { from: boundary + 1, to: state.base.at.boundary - 1, reason: "history" as const }].slice(-PATTERN_GAPS_CAP) } : next;
};

export const storyHasPatterns = (story: NormalizedStory | null | undefined): boolean => Boolean(story?.patterns?.length);

export interface PatternsPortDeps {
  engine: StoryEngine;
  loaded: () => LoadedStory | null;
  extras: () => RuntimeExtras;
  enabled: () => boolean;
  persist: () => Promise<void>;
  notify: () => void;
  refresh?: () => void;
}

export function createPatternsPort(deps: PatternsPortDeps) {
  return {
    onBoundary(result: BoundaryResult, recap: RecapOutcome | null) {
      const story = deps.loaded()?.story;
      if (!storyHasPatterns(story) || !story) return;
      const extras = deps.extras();
      const state = extras.patterns ?? createPatterns();
      if (!deps.enabled()) {
        extras.patterns = addGap(state, result.boundary, "off");
      } else if (!kit || !recap || "unavailable" in recap) {
        if (!kit) void loadPatternsKit().then(() => deps.notify());
        extras.patterns = addGap(state, result.boundary, "kit");
      } else {
        const applied = kit.applyBoundary(story, state, { boundary: result.boundary, messageId: result.context.lastMessageId }, recap.derived);
        extras.patterns = kit.foldFloor(applied, deps.engine.historyFrom().boundary);
      }
      if (extras.patterns === state) return;
      if (extras.patterns.completed !== state.completed) deps.refresh?.();
      void deps.persist();
      deps.notify();
    },
  };
}

export const reconcilePatternsOnUpdate = (state: PatternsState | undefined, next: NormalizedStory): PatternsState | undefined =>
  (state && kit ? kit.reconcilePatterns(state, next) : state);

export const patternProjection = (story: NormalizedStory | null, state: PatternsState | undefined, engineState: EngineState | null, resting: PatternResting): PublicPattern[] =>
  (story && state && engineState && kit ? kit.patternProjection(story, state, engineState, resting) : []);

export const patternCallbacks = (story: NormalizedStory | null, state: PatternsState | undefined, engineState: EngineState | null, resting: PatternResting): RecapLine[] =>
  (story && state && engineState && kit ? kit.callbackLines(story, state, engineState, resting) : []);

export const patternHints = (story: NormalizedStory | null, state: PatternsState | undefined, engineState: EngineState | null, resting: PatternResting): string[] =>
  (story && state && engineState && kit ? kit.hintLines(story, state, engineState, resting) : []);

export const patternAuthorSlice = (
  story: NormalizedStory | null, state: PatternsState | undefined, engineState: EngineState | null, resting: PatternResting, authorView: boolean,
): PatternAuthorSlice | null =>
  (authorView && story?.patterns?.length && engineState && kit ? kit.authorSlice(story, state ?? createPatterns(), engineState, resting) : null);

export const patternsUnavailable = (story: NormalizedStory | null, state: PatternsState | undefined, engineState: EngineState | null, on: boolean): boolean =>
  Boolean(on && story?.patterns?.length && (!kit || (state?.gaps ?? []).some((gap) => gap.reason === "kit" && gap.to >= (engineState?.boundary ?? 0) - 3)));

export const patternResting = (enabled: readonly string[] | undefined, filter: ((text: string) => string) | undefined): PatternResting =>
  ({ enabled: enabled ?? [], restates: (text) => (filter ? filter(text) !== text : false) });

type SnapshotExtras = Pick<RuntimeExtras, "patterns" | "memory" | "ui">;
type RestingSources = { enabled?: readonly string[]; resting?: (text: string) => string };

const patternsOn = (extras: SnapshotExtras) => extras.memory.settings.patterns !== false;

export const patternRecapLines = (story: NormalizedStory | null, extras: SnapshotExtras, state: EngineState | null, sources: RestingSources): RecapLine[] =>
  (patternsOn(extras) ? patternCallbacks(story, extras.patterns, state, patternResting(sources.enabled, sources.resting)) : []);

export const patternSlices = (story: NormalizedStory | null, extras: SnapshotExtras, state: EngineState | null, sources: RestingSources) => {
  const on = patternsOn(extras);
  const resting = patternResting(sources.enabled, sources.resting);
  return {
    patterns: on ? patternProjection(story, extras.patterns, state, resting) : [],
    patternsAuthor: patternAuthorSlice(story, extras.patterns, state, resting, extras.ui.authorView),
    patternsUnavailable: patternsUnavailable(story, extras.patterns, state, on),
  };
};

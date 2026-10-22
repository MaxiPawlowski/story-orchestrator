import type { BoundaryResult, PlayerSpan, PrimitiveValue, StoryEngine } from "@engine/index";
import { isRecord } from "@utils/guards";
import type { RecapSection, RecapView } from "./consequences";
import type { LoadedStory, RuntimeExtras } from "./types";

export type EffectKind = "transition" | "quest" | "milestone" | "check" | "agenda";

export interface CauseRef {
  key: string;
  value: PrimitiveValue;
  origin?: string;
  playerSpan: PlayerSpan;
}

export interface EffectRef {
  kind: EffectKind;
  id: string;
  from?: string;
  to?: string;
  boundary: number;
  messageId: number;
  chapterId: string | null;
  visible: boolean;
  authored: boolean;
  causes: CauseRef[];
}

export interface RecapRuntimeState {
  refs: EffectRef[];
}

export const RECAP_REF_CAP = 600;

export type RecapOutcome = { derived: EffectRef[] } | { unavailable: "kit" };

type RecapKit = typeof import("./consequences");

let kit: RecapKit | null = null;

export const loadRecapKit = async (): Promise<RecapKit> => (kit ??= await import("./consequences"));

const EFFECT_KINDS: readonly string[] = ["transition", "quest", "milestone", "check", "agenda"];

const isRef = (value: unknown): value is EffectRef => isRecord(value) && EFFECT_KINDS.includes(String(value.kind)) && typeof value.id === "string"
  && Number.isInteger(value.boundary) && Number.isInteger(value.messageId) && Array.isArray(value.causes);

export const sanitizeRecap = (value: unknown): RecapRuntimeState | undefined =>
  (isRecord(value) && Array.isArray(value.refs) ? { refs: value.refs.filter(isRef).slice(-RECAP_REF_CAP) } : undefined);

export const appendRefs = (state: RecapRuntimeState | undefined, refs: readonly EffectRef[]): RecapRuntimeState | undefined => {
  if (!refs.length) return state;
  const boundary = refs[0].boundary;
  return { refs: [...(state?.refs ?? []).filter((ref) => ref.boundary < boundary), ...refs].slice(-RECAP_REF_CAP) };
};

export const rollbackRecap = (state: RecapRuntimeState | undefined, boundary: number): RecapRuntimeState | undefined =>
  (state?.refs.some((ref) => ref.boundary > boundary) ? { refs: state.refs.filter((ref) => ref.boundary <= boundary) } : state);

export interface RecapPortDeps {
  engine: StoryEngine;
  loaded: () => LoadedStory | null;
  extras: () => RuntimeExtras;
  persist: () => Promise<void>;
  notify: () => void;
}

export function createRecapPort(deps: RecapPortDeps) {
  return {
    onBoundary(result: BoundaryResult): RecapOutcome | null {
      const loaded = deps.loaded();
      const entry = deps.engine.stateLog.at(-1);
      if (!loaded || !entry || entry.boundary !== result.boundary) return null;
      if (!kit) return { unavailable: "kit" };
      const extras = deps.extras();
      const derived = kit.deriveRefs(loaded.story, entry, extras.checks?.records ?? []);
      const next = appendRefs(extras.recap, derived);
      if (next === extras.recap) return { derived };
      extras.recap = next;
      void deps.persist();
      deps.notify();
      return { derived };
    },
  };
}

export const recapSection = (view: RecapView): RecapSection | null => kit?.currentSection(view) ?? null;

export const recapCardSections = (view: RecapView): Record<number, RecapSection> => kit?.cardSections(view) ?? {};

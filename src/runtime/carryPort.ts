import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { isCarryState, type CarryMode, type CarrySlice, type CarryState, type NormalizedStoryV2, type PrimitiveValue, type StoryEngine } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import { withholds } from "./generationLifecycle";
import type { RunOwnership } from "./runToken";
import type { LoadedStory, RuntimeExtras } from "./types";

export const PREVIOUSLY_HEADER = "Previously, in an earlier story this player finished (background for the narrator; a character knows a part of it only if their own notes say so):";

export interface CarryView {
  story: string;
  mode: CarryMode;
  required: boolean;
  pending: boolean;
  canPick: boolean;
  state: CarryState | null;
  active: boolean;
}

export interface CarryCandidateRow {
  chatId: string;
  title: string;
  endingTitle: string;
  endedAt: string;
}

export interface CarryDeps {
  loaded: () => LoadedStory | null;
  extras: () => RuntimeExtras;
  engine: StoryEngine;
  chatId: () => string | null;
  ownership: RunOwnership;
  journal: (summary: string, note: string) => void;
  refresh: () => void;
  persist: () => Promise<void>;
  notify: () => void;
}

export type CarryOutcome = { ok: true } | { ok: false; reason: string };

const stateOf = (extras: Pick<RuntimeExtras, "carry">): CarryState | null => (isCarryState(extras.carry) ? extras.carry : null);

export const carrySlice = (story: NormalizedStoryV2 | null, extras: RuntimeExtras, boundary: number): CarryView | null => {
  const from = story?.carry_from;
  if (!from) return null;
  const state = stateOf(extras);
  return {
    story: from.story, mode: from.mode, required: from.default === "require", pending: !extras.carry, canPick: boundary === 0, state,
    active: Boolean(gameLayer()?.carry.previouslyActive(state, boundary, extras.memory.chapters?.length ?? 0)),
  };
};

export const carryStartSeed = (story: NormalizedStoryV2, extras: RuntimeExtras, journal: (summary: string, note: string) => void): Record<string, PrimitiveValue> => {
  const carry = stateOf(extras);
  const layer = gameLayer();
  if (!carry || !layer) return {};
  const { seed, kept, dropped } = layer.carry.carrySeed(story, carry);
  if (dropped.length) extras.carry = { ...carry, values: kept };
  dropped.forEach((skip) => journal(`carried value dropped: ${skip.key}`, skip.reason));
  return seed;
};

export const carryKnown = (extras: RuntimeExtras, rosterId: string): string[] => gameLayer()?.carry.carryKnownLines(stateOf(extras), rosterId) ?? [];

export const previouslyBlock = (view: CarryView | null): string | null => (view?.active && view.state?.previously ? `${PREVIOUSLY_HEADER}\n${view.state.previously}` : null);

export const createPreviouslyNotice = (deps: { block: () => string | null; set: (key: string, text: string, depth: number) => unknown; clear: (key: string) => unknown }) => {
  const spec = INJECTION_REGISTRY.previously;
  let active = false;
  const clear = () => {
    if (active) deps.clear(spec.key);
    active = false;
  };
  return {
    opened(type: unknown) {
      const text = withholds(type) ? null : deps.block();
      if (!text) return clear();
      deps.set(spec.key, text, spec.depth);
      active = true;
    },
    closed: clear,
  };
};

const unit = () => import("./carryUnit");

export const createCarryActions = (deps: CarryDeps) => ({
  candidates: async (): Promise<CarryCandidateRow[]> => (await unit()).carryCandidates(deps),
  pick: async (chatId: string): Promise<CarryOutcome> => (await unit()).pickCarry(deps, chatId),
  decline: async (): Promise<CarryOutcome> => (await unit()).declineCarry(deps),
  dismiss: async (): Promise<CarryOutcome> => (await unit()).dismissPreviously(deps),
});

export type CarryActions = ReturnType<typeof createCarryActions>;

declare module "./types" {
  interface RuntimeExtras {
    carry?: CarrySlice;
  }
  interface RuntimeSnapshot {
    carry?: CarryView | null;
  }
}

import type { PrimitiveValue } from "./schema";

export const HERITAGE_KEY_PREFIX = "heritage_";
export const CARRY_MODES = ["sequel", "replay"] as const;
export type CarryMode = (typeof CARRY_MODES)[number];
export const CARRY_AS = ["heritage", "state"] as const;
export type CarryAs = (typeof CARRY_AS)[number];
export const CARRY_DEFAULTS = ["snapshot", "require"] as const;
export type CarryDefault = (typeof CARRY_DEFAULTS)[number];
export const OUTCOME_MAX = 12;
export const HERITAGE_TEXT_MAX = 240;
export const CARRY_CANDIDATES_MAX = 20;
export const PREVIOUSLY_TOKENS = 350;
export const PREVIOUSLY_BOUNDARIES = 12;

export interface OutcomeKey {
  key: string;
  heritage_text?: Record<string, string>;
}

export type CarryKnownBy = string[] | "all" | "none";

export interface CarryMapEntry {
  from: string;
  to: string;
  as: CarryAs;
  known_by?: CarryKnownBy;
}

export interface CarryFrom {
  story: string;
  mode: CarryMode;
  map: CarryMapEntry[];
  replay_map?: string[];
  previously?: boolean;
  default: CarryDefault;
}

export interface CarryOutcomeLine {
  key: string;
  value: PrimitiveValue;
  label: string;
}

export interface CarryProjection {
  storyTitle: string;
  endingTitle: string;
  outcome: CarryOutcomeLine[];
  lines: string[];
}

export interface CarryValue {
  from: string;
  key: string;
  as: CarryAs;
  value: PrimitiveValue;
  label: string;
  knownBy: string[];
}

export interface CarryState {
  fromChat: string;
  fromStory: string;
  sourceStoryHash: string;
  mode: CarryMode;
  projection: CarryProjection;
  values: CarryValue[];
  previously: string | null;
  block: string | null;
  createdAt: string;
  dismissed?: true;
}

export interface CarryView {
  story: string;
  mode: CarryMode;
  required: boolean;
  pending: boolean;
  canPick: boolean;
  state: CarryState | null;
  active: boolean;
  block: string | null;
}

export interface CarryDeclined {
  declined: true;
  at: string;
}

export type CarrySlice = CarryState | CarryDeclined;

declare module "./schema" {
  interface Story {
    outcome?: OutcomeKey[];
    carry_from?: CarryFrom;
  }
}

export const isHeritageKey = (key: string): boolean => key.startsWith(HERITAGE_KEY_PREFIX);
export const isCarryState = (slice: CarrySlice | null | undefined): slice is CarryState => Boolean(slice && !("declined" in slice));

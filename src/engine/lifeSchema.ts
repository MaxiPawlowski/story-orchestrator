import type { GateNode, NpcReplyEffect } from "./schema";

export const RELATIONSHIP_TOWARD_PLAYER = "player";
export const MOOD_DEFAULT_VALUES = ["calm", "tense", "angry", "afraid", "elated"] as const;
export const AGENDA_PACES = ["per_chapter", "per_n_boundaries"] as const;
export type AgendaPace = (typeof AGENDA_PACES)[number];
export const AGENDA_EVERY_DEFAULT = 3;
export const RELATIONSHIP_RANGE_DEFAULT: [number, number] = [-5, 5];
export const CLOCK_DAY_KEY = "story_day";
export const CLOCK_TIME_KEY = "time_of_day";
export const CLOCK_SEEN_KEY = "life_time_seen";
export const TURN_OOC_KEY = "life_turn_ooc";
export const LIFE_KEY_PREFIXES = ["rel_", "mood_", "agenda_", "life_"] as const;

export interface PublicLabel {
  label: string;
  when?: GateNode;
  follows_feeling?: boolean;
  hold?: number;
}

export interface SecretLabel {
  id: string;
  label: string;
  revealed_when: GateNode;
}

export interface RelationshipDecl {
  toward: string;
  axes: string[];
  range: [number, number];
  step: number;
  start: number;
  label?: string;
  public?: PublicLabel[];
  secret?: SecretLabel[];
}

export type MoodLasts = { boundaries: number } | { until: "scene_break" };

export interface MoodDecl {
  values: string[];
  baseline: string;
  lasts: MoodLasts;
}

export interface AgendaStepEffect {
  world_info?: unknown;
  npc_replies?: NpcReplyEffect[];
}

export interface AgendaStep {
  text: string;
  when?: GateNode;
  effect?: AgendaStepEffect;
  public?: boolean;
  repeat?: boolean;
}

export interface Agenda {
  id: string;
  goal: string;
  steps: AgendaStep[];
  pace: AgendaPace;
  every?: number;
}

export interface ScheduleEntry {
  when: GateNode;
  at: string;
}

export interface StoryClock {
  times: string[];
  start_day?: number;
}

export interface LifeMember {
  id: string;
  relationships: RelationshipDecl[];
  mood?: MoodDecl;
  agenda: Agenda[];
  schedule: ScheduleEntry[];
}

export interface StoryLife {
  members: LifeMember[];
  clock?: StoryClock;
  names?: Record<string, string>;
}

export interface QualityStepRule {
  step: number;
  min?: number;
  max?: number;
  start?: number;
  cycle?: boolean;
}

export const relationshipKey = (holder: string, toward: string, axis: string): string => `rel_${holder}_${toward}_${axis}`;
export const moodKey = (member: string): string => `mood_${member}`;
export const moodAgeKey = (member: string): string => `life_mood_${member}_age`;
export const moodSceneKey = (member: string): string => `life_mood_${member}_scene`;
export const moodWasKey = (member: string): string => `life_mood_${member}_was`;
export const agendaStepKey = (member: string, agenda: string): string => `agenda_${member}_${agenda}_step`;
export const agendaWaitKey = (member: string, agenda: string): string => `agenda_${member}_${agenda}_wait`;
export const agendaChapterKey = (member: string, agenda: string): string => `agenda_${member}_${agenda}_chapter`;
export const agendaRepeatsKey = (member: string, agenda: string): string => `agenda_${member}_${agenda}_repeats`;

export const LABEL_REVEAL_PREFIX = "life_reveal_";
export const LABEL_SHOWN_PREFIX = "life_label_";
export const revealKey = (holder: string, toward: string, id: string): string => `${LABEL_REVEAL_PREFIX}${holder}_${toward}_${id}`;
export const labelShownKey = (holder: string, toward: string): string => `${LABEL_SHOWN_PREFIX}${holder}_${toward}`;
export const labelNextKey = (holder: string, toward: string): string => `${labelShownKey(holder, toward)}_next`;
export const labelSinceKey = (holder: string, toward: string): string => `${labelShownKey(holder, toward)}_since`;
export const isLabelKey = (key: string): boolean => key.startsWith(LABEL_REVEAL_PREFIX) || key.startsWith(LABEL_SHOWN_PREFIX);
export const isRevealKey = (key: string): boolean => key.startsWith(LABEL_REVEAL_PREFIX);
export const hasLabels = (relationship: Pick<RelationshipDecl, "public" | "secret">): boolean => Boolean(relationship.public?.length || relationship.secret?.length);

export const isLifeKey = (key: string): boolean => LIFE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) || key === CLOCK_DAY_KEY || key === CLOCK_TIME_KEY;

import type { GateNode, NpcReplyEffect, PrimitiveValue } from "./schema";

export const QUALITY_DISPLAY_AS = ["meter", "count", "word", "item", "boxes"] as const;
export type QualityDisplayAs = (typeof QUALITY_DISPLAY_AS)[number];
export const BOXES_MAX = 12;

export interface DisplayBand {
  max?: number;
  label: string;
}

export interface QualityDisplay {
  public: true;
  label: string;
  as: QualityDisplayAs;
  group?: string;
  min?: number;
  max?: number;
  bands?: DisplayBand[];
  hide_when_empty?: boolean;
  trend?: boolean;
}

export interface QuestProgress {
  quality: string;
  of: number;
}

export interface QuestStep {
  text: string;
  done_when: GateNode;
  failed_when?: GateNode;
  visible_when?: GateNode;
  progress?: QuestProgress;
}

export interface QuestRewardEffects {
  world_info?: unknown;
  cast_changes?: unknown;
  npc_replies?: NpcReplyEffect[];
}

export type RewardWrite = PrimitiveValue | { add: number };

export interface QuestReward {
  set?: Record<string, RewardWrite>;
  effects?: QuestRewardEffects;
  label?: string;
  visible_when?: GateNode;
}

export interface QuestLabels {
  done?: string;
  failed?: string;
}

export interface Quest {
  id: string;
  title: string;
  kind: "side";
  visible_when?: GateNode;
  offered_when?: GateNode;
  done_when: GateNode;
  failed_when?: GateNode;
  steps: QuestStep[];
  requires?: string[];
  progress?: QuestProgress;
  labels?: QuestLabels;
  giver?: string;
  author_note?: string;
  reward?: QuestReward;
}

export const CHECK_NARRATE = ["public", "hidden"] as const;
export type CheckNarrate = (typeof CHECK_NARRATE)[number];
export const CHECK_DEGREES = ["miss", "weak", "strong"] as const;
export type CheckDegree = (typeof CHECK_DEGREES)[number];
export const CHECK_DICE_MAX = 4;

export interface CheckRoll {
  sides: number;
  target: number;
  dice?: number;
}

export interface CheckModifier {
  q: string;
  v: PrimitiveValue;
  add: number;
  label?: string;
}

export interface CheckOutcomeBands {
  quality: string;
  bands: "margin";
  partial_margin: number;
}

export interface StoryCheck {
  id: string;
  label?: string;
  quality: string;
  roll: CheckRoll;
  modifiers?: CheckModifier[];
  narrate: CheckNarrate;
  outcome?: CheckOutcomeBands;
  twist?: { quality: string };
}

export interface Milestone {
  id: string;
  title: string;
  when: GateNode;
  secret?: boolean;
}

export const WIDGET_KINDS = ["meters", "track", "log", "clock", "board", "clues", "map", "html", "roster", "timeline"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];
export const WIDGET_AUDIENCES = ["player", "author"] as const;
export type WidgetAudience = (typeof WIDGET_AUDIENCES)[number];
export const WIDGET_ACCENTS = ["default", "gold", "green", "red", "blue", "violet"] as const;
export type WidgetAccent = (typeof WIDGET_ACCENTS)[number];
export const WIDGET_ICONS = ["scroll", "flag", "star", "heart", "shield", "hourglass", "compass", "key", "gem", "book"] as const;
export type WidgetIcon = (typeof WIDGET_ICONS)[number];

export type WidgetBind =
  | { quality: string }
  | { qualities: string[] }
  | { group: string }
  | { quests: true }
  | { path: true }
  | { arcs: true }
  | { releases: string };

export interface WidgetOptions {
  limit?: number;
  closed?: boolean;
}

export interface WidgetClue {
  id: string;
  text: string;
  when: GateNode;
  action?: string;
}

export interface WidgetClueLink {
  from: string;
  to: string;
  label?: string;
}

export interface WidgetPin {
  id: string;
  label: string;
  x: number;
  y: number;
  checkpoint?: string;
  when?: GateNode;
  action?: string;
}

export interface WidgetRosterRow {
  id: string;
  label?: string;
  member?: string;
  quality: string;
  when?: GateNode;
}

export interface StoryWidget {
  id: string;
  kind: WidgetKind;
  title: string;
  bind?: WidgetBind;
  options?: WidgetOptions;
  visible_when?: GateNode;
  audience: WidgetAudience;
  accent?: WidgetAccent;
  icon?: WidgetIcon;
  clues?: WidgetClue[];
  links?: WidgetClueLink[];
  image?: string;
  pins?: WidgetPin[];
  template?: string;
  source?: string;
  actions?: WidgetIntent[];
  rows?: WidgetRosterRow[];
  dates?: Record<string, string>;
}

export const WIDGET_DRAWER_TABS = ["overview", "memory"] as const;
export type WidgetDrawerTab = (typeof WIDGET_DRAWER_TABS)[number];

export interface WidgetIntent {
  id: string;
  text: string;
  open?: WidgetDrawerTab;
  check?: string;
}

export const questRewardKey = (questId: string): string => `quest_${questId}_rewarded`;

export const questClosedKey = (questId: string): string => `quest_${questId}_closed`;

export const QUEST_CLOSED_VALUES = ["done", "failed"] as const;

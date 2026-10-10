import type { QualityDisplayAs, QuestStatus, WidgetAccent, WidgetAudience, WidgetDrawerTab, WidgetIcon } from "@engine/index";

export type QuestLane = Exclude<QuestStatus, "hidden">;

export interface ProgressView {
  value: number;
  of: number;
}

export interface QuestStepView {
  text: string;
  status: "open" | "done" | "failed";
  progress?: ProgressView;
}

export interface QuestView {
  title: string;
  status: QuestLane;
  statusLabel: string;
  closed: boolean;
  giver: string | null;
  steps: QuestStepView[];
  progress?: ProgressView;
  reward: string | null;
}

export interface MainLineView {
  done: string[];
  current: string | null;
  objective: string | null;
}

export type Trend = "up" | "down" | "flat";

export interface SheetItemView {
  label: string;
  as: QualityDisplayAs;
  text: string;
  value?: number;
  min?: number;
  max?: number;
  trend?: Trend;
  changedAgo?: number;
}

export interface SheetGroupView {
  label: string;
  items: SheetItemView[];
}

export interface MilestoneView {
  title: string;
  earned: boolean;
}

export const LOG_KINDS = ["action", "world_event", "check", "quest", "milestone"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export interface LogRowView {
  at: { boundary: number; messageId: number };
  kind: LogKind;
  actor?: string;
  text: string;
  outcome?: string;
}

export interface BoardLane {
  label: string;
  cards: string[];
}

export interface ClueView {
  text: string;
  fresh: boolean;
  action?: string;
}

export interface ClueLinkView {
  from: number;
  to: number;
  label?: string;
}

export interface PinView {
  label: string;
  x: number;
  y: number;
  here: boolean;
  fresh: boolean;
  action?: string;
}

export interface RollHint {
  label: string;
  dice: string;
  target: number;
}

export interface IntentView {
  id: string;
  text: string;
  open?: WidgetDrawerTab;
  roll?: RollHint;
}

export interface RosterRowView {
  name: string;
  status: string;
  changedAgo?: number;
}

export interface TimelineStopView {
  name: string;
  date?: string;
  here: boolean;
  fresh: boolean;
}

export interface TimelineChapterView {
  title: string | null;
  stops: TimelineStopView[];
}

export type WidgetBody =
  | { kind: "html"; template: string; actions: IntentView[]; source: WidgetView }
  | { kind: "clues"; clues: ClueView[]; links: ClueLinkView[] }
  | { kind: "map"; image: string; pins: PinView[] }
  | { kind: "meters"; groups: SheetGroupView[] }
  | { kind: "track"; main: MainLineView | null; quests: QuestView[] }
  | { kind: "log"; rows: LogRowView[] }
  | { kind: "clock"; label: string; filled: number; segments: number; full: boolean; changedAgo?: number }
  | { kind: "board"; lanes: BoardLane[] }
  | { kind: "roster"; rows: RosterRowView[] }
  | { kind: "timeline"; chapters: TimelineChapterView[] };

export interface WidgetView {
  id: string;
  title: string;
  audience: WidgetAudience;
  synthesized: boolean;
  accent?: WidgetAccent;
  icon?: WidgetIcon;
  actions?: IntentView[];
  still?: true;
  body: WidgetBody;
}

export type ProvenanceWriter = "reader" | "story" | "author";

export interface ProvenanceView {
  label: string;
  key: string;
  writer?: ProvenanceWriter;
  boundary?: number;
  messageId?: number;
}

export interface GameView {
  quests: QuestView[];
  mainLine: MainLineView;
  sheet: SheetGroupView[];
  milestones: MilestoneView[];
  log: LogRowView[];
  journal: WidgetView[];
  statSheet: WidgetView | null;
  widgets: WidgetView[];
}

export interface GameAuthorView {
  quests: Array<{ id: string; title: string; status: QuestStatus }>;
  scopeOverflow: string[];
  widgets: WidgetView[];
  provenance?: Record<string, ProvenanceView[]>;
}

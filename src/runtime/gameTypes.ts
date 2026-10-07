import type { QualityDisplayAs, QuestStatus, WidgetAccent, WidgetAudience, WidgetIcon } from "@engine/index";

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

export type WidgetBody =
  | { kind: "meters"; groups: SheetGroupView[] }
  | { kind: "track"; main: MainLineView | null; quests: QuestView[] }
  | { kind: "log"; rows: LogRowView[] }
  | { kind: "clock"; label: string; filled: number; segments: number; full: boolean }
  | { kind: "board"; lanes: BoardLane[] };

export interface WidgetView {
  id: string;
  title: string;
  audience: WidgetAudience;
  synthesized: boolean;
  accent?: WidgetAccent;
  icon?: WidgetIcon;
  body: WidgetBody;
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
}

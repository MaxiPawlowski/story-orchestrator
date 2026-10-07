import {
  checksById, evaluateGate, isClosed, milestoneEarned, questStatus, stepStatus, valueReader, type BoundaryLogEntry, type EngineState, type GateReader, type NormalizedStoryV2,
  type PrimitiveValue, type Quest, type QuestProgress, type StoryWidget,
} from "@engine/index";
import { isRecord } from "@utils/guards";
import type {
  BoardLane, GameView, LogRowView, MainLineView, MilestoneView, ProgressView, QuestLane, QuestView, SheetGroupView, WidgetBody, WidgetView,
} from "./gameTypes";
import { previousValues, sheetGroups } from "./gameSheet";
import { checkLabel, type CheckRecord } from "./storyCheckDraws";
import { questMoveText } from "@features/gameCopy";

export const LOG_LIMIT = 40;
export const ACTION_CHARS = 140;
export const SECRET_TITLE = "???";
export const PLAYER_ACTOR = "You";

export interface GameSources {
  story: NormalizedStoryV2;
  state: EngineState;
  boundaryLog: readonly BoundaryLogEntry[];
  checks: readonly CheckRecord[];
  threads: { open: string[]; resolved: string[] };
  chat: readonly unknown[];
  castNames: Record<string, string>;
}

export interface GameCompose {
  player: GameView;
  authorWidgets: WidgetView[];
}

const STATUS_LABELS: Record<QuestLane, string> = { offered: "Offered", active: "Active", done: "Done", failed: "Failed" };

const progressOf = (progress: QuestProgress | undefined, values: Readonly<Record<string, PrimitiveValue>>): ProgressView | undefined => {
  if (!progress) return undefined;
  const value = values[progress.quality];
  return { value: Math.min(progress.of, Math.max(0, typeof value === "number" ? value : 0)), of: progress.of };
};

const questView = (quest: Quest, status: QuestLane, reader: GateReader, values: Readonly<Record<string, PrimitiveValue>>, castNames: Record<string, string>): QuestView => {
  const steps = quest.steps.flatMap((step) => {
    const shown = stepStatus(step, reader);
    if (shown === "hidden") return [];
    const progress = progressOf(step.progress, values);
    return [{ text: step.text, status: shown, ...(progress ? { progress } : {}) }];
  });
  const reward = quest.reward?.label && (!quest.reward.visible_when || evaluateGate(quest.reward.visible_when, reader)) ? quest.reward.label : null;
  const progress = progressOf(quest.progress, values);
  return {
    title: quest.title, status, closed: isClosed(status), giver: quest.giver ? castNames[quest.giver] ?? null : null, steps, reward,
    statusLabel: status === "done" ? quest.labels?.done ?? STATUS_LABELS.done : status === "failed" ? quest.labels?.failed ?? STATUS_LABELS.failed : STATUS_LABELS[status],
    ...(progress ? { progress } : {}),
  };
};

const visibleQuests = (story: NormalizedStoryV2, reader: GateReader, values: Readonly<Record<string, PrimitiveValue>>, castNames: Record<string, string>): QuestView[] =>
  (story.quests ?? []).flatMap((quest) => {
    const status = questStatus(quest, reader);
    return status === "hidden" ? [] : [questView(quest, status, reader, values, castNames)];
  });

const mainLine = (story: NormalizedStoryV2, state: EngineState): MainLineView => {
  const active = story.checkpointById[state.activeCheckpointId];
  const done = [...new Set(state.visitedPath.slice(0, -1).map((id) => story.checkpointById[id]?.player_name).filter((name): name is string => Boolean(name)))];
  return { done, current: active?.player_name ?? null, objective: active?.player_name ? active.player_text ?? null : null };
};

const milestones = (story: NormalizedStoryV2, reader: GateReader): MilestoneView[] => (story.milestones ?? []).map((milestone) => {
  const earned = milestoneEarned(milestone, reader);
  return { title: earned || !milestone.secret ? milestone.title : SECRET_TITLE, earned };
});

const statusMoves = (story: NormalizedStoryV2, entry: BoundaryLogEntry): LogRowView[] => {
  const before = valueReader(entry.before.blackboard.values);
  const after = valueReader(entry.after.blackboard.values);
  const at = { boundary: entry.boundary, messageId: entry.context.lastMessageId };
  const quests = (story.quests ?? []).flatMap((quest): LogRowView[] => {
    const from = questStatus(quest, before);
    const to = questStatus(quest, after);
    if (from === to || to === "hidden") return [];
    return [{ at, kind: "quest", text: questMoveText(to, quest.title, quest.labels) }];
  });
  const earned = (story.milestones ?? []).filter((milestone) => !milestoneEarned(milestone, before) && milestoneEarned(milestone, after))
    .map((milestone): LogRowView => ({ at, kind: "milestone", text: `Milestone: ${milestone.title}` }));
  const reached = entry.fired ? story.checkpointById[entry.fired.to]?.player_name : undefined;
  return [...(reached ? [{ at, kind: "world_event" as const, text: `Reached ${reached}` }] : []), ...quests, ...earned];
};

const checkRows = (story: NormalizedStoryV2, records: readonly CheckRecord[]): LogRowView[] => {
  const byId = checksById(story);
  return records.flatMap((record): LogRowView[] => {
    const check = byId.get(record.checkId);
    if (!check || check.narrate !== "public") return [];
    const bonus = record.total - record.draws.reduce((sum, face) => sum + face, 0);
    const roll = `${record.total - bonus}${bonus ? ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}` : ""} vs ${record.target}`;
    return [{ at: { boundary: record.boundary, messageId: record.messageId }, kind: "check", text: `${checkLabel(story, check)}: ${roll}`, outcome: record.outcome }];
  });
};

const firstLine = (text: string) => {
  const line = text.split(/\r?\n/).find((part) => part.trim())?.trim() ?? "";
  return line.length > ACTION_CHARS ? `${line.slice(0, ACTION_CHARS - 1)}…` : line;
};

const actionRows = (chat: readonly unknown[], from: number, log: readonly BoundaryLogEntry[]): LogRowView[] => chat.flatMap((row, messageId): LogRowView[] => {
  if (!isRecord(row) || row.is_user !== true || row.is_system === true || messageId <= from || typeof row.mes !== "string" || !row.mes.trim()) return [];
  const boundary = log.find((entry) => entry.context.lastMessageId >= messageId)?.boundary ?? (log.at(-1)?.boundary ?? 0);
  return [{ at: { boundary, messageId }, kind: "action", actor: PLAYER_ACTOR, text: firstLine(row.mes) }];
});

const composeLog = (sources: GameSources): LogRowView[] => {
  const from = sources.boundaryLog[0]?.before.lastMessageId ?? -1;
  return [...sources.boundaryLog.flatMap((entry) => statusMoves(sources.story, entry)), ...checkRows(sources.story, sources.checks), ...actionRows(sources.chat, from, sources.boundaryLog)]
    .sort((left, right) => right.at.messageId - left.at.messageId || right.at.boundary - left.at.boundary)
    .slice(0, LOG_LIMIT);
};

const metersFor = (widget: StoryWidget, sources: GameSources, sheet: SheetGroupView[]): SheetGroupView[] => {
  const bind = widget.bind;
  if (!bind || !("quality" in bind || "qualities" in bind || "group" in bind)) return sheet;
  const grouped = (group: string) => sources.story.qualities.filter((quality) => quality.display?.group === group).map((quality) => quality.key);
  const keys = "quality" in bind ? [bind.quality] : "qualities" in bind ? bind.qualities : grouped(bind.group);
  const qualities = keys.map((key) => sources.story.qualityByKey[key]).filter((quality) => quality?.display);
  return sheetGroups(qualities, sources.state.blackboard.values, previousValues(sources.boundaryLog));
};

const boardLanes = (widget: StoryWidget, quests: QuestView[], threads: GameSources["threads"]): BoardLane[] => {
  if (widget.bind && "arcs" in widget.bind) return [{ label: "Open", cards: threads.open }, { label: "Resolved", cards: threads.resolved }].filter((lane) => lane.cards.length);
  const is = (status: QuestView["status"]) => (quest: QuestView) => quest.status === status;
  const lane = (label: string, wanted: (quest: QuestView) => boolean) => ({ label, cards: quests.filter(wanted).map((quest) => quest.title) });
  const lanes = widget.options?.closed === false
    ? [lane("Offered", is("offered")), lane("Active", is("active")), lane("Done", is("done")), lane("Failed", is("failed"))]
    : [lane("Offered", is("offered")), lane("Active", is("active")), lane("Closed", (quest) => quest.closed)];
  return lanes.filter((entry) => entry.cards.length);
};

const clockBody = (widget: StoryWidget, sources: GameSources): WidgetBody | null => {
  const key = widget.bind && "quality" in widget.bind ? widget.bind.quality : null;
  const quality = key ? sources.story.qualityByKey[key] : undefined;
  const display = quality?.display;
  if (!quality || !display || display.min === undefined || display.max === undefined) return null;
  const raw = sources.state.blackboard.values[quality.key];
  const segments = display.max - display.min;
  const filled = Math.min(segments, Math.max(0, (typeof raw === "number" ? raw : display.min) - display.min));
  return { kind: "clock", label: display.label, filled, segments, full: filled >= segments };
};

const widgetBody = (widget: StoryWidget, sources: GameSources, parts: { quests: QuestView[]; sheet: SheetGroupView[]; main: MainLineView; log: LogRowView[] }): WidgetBody | null => {
  const limit = widget.options?.limit;
  if (widget.kind === "meters") return { kind: "meters", groups: metersFor(widget, sources, parts.sheet) };
  if (widget.kind === "track") return widget.bind && "quests" in widget.bind ? { kind: "track", main: null, quests: parts.quests } : { kind: "track", main: parts.main, quests: [] };
  if (widget.kind === "log") return { kind: "log", rows: limit ? parts.log.slice(0, limit) : parts.log };
  if (widget.kind === "board") return { kind: "board", lanes: boardLanes(widget, parts.quests, sources.threads) };
  return clockBody(widget, sources);
};

const emptyBody = (body: WidgetBody): boolean =>
  (body.kind === "meters" && !body.groups.length) || (body.kind === "log" && !body.rows.length) || (body.kind === "board" && !body.lanes.length)
  || (body.kind === "track" && !body.quests.length && !body.main?.current && !body.main?.done.length);

const viewOf = (widget: StoryWidget, body: WidgetBody): WidgetView => ({
  id: widget.id, title: widget.title, audience: widget.audience, synthesized: false, body, ...(widget.accent ? { accent: widget.accent } : {}), ...(widget.icon ? { icon: widget.icon } : {}),
});

const synthesized = (id: string, title: string, body: WidgetBody): WidgetView => ({ id, title, audience: "player", synthesized: true, body });

export function composeGame(sources: GameSources): GameCompose {
  const { story, state } = sources;
  const values = state.blackboard.values;
  const reader = valueReader(values);
  const parts = {
    quests: visibleQuests(story, reader, values, sources.castNames), sheet: sheetGroups(story.qualities, values, previousValues(sources.boundaryLog)),
    main: mainLine(story, state), log: composeLog(sources),
  };
  const authored = (story.widgets ?? []).filter((widget) => !widget.visible_when || evaluateGate(widget.visible_when, reader)).flatMap((widget) => {
    const body = widgetBody(widget, sources, parts);
    return body && !emptyBody(body) ? [viewOf(widget, body)] : [];
  });
  const player = authored.filter((widget) => widget.audience === "player");
  const kinds = (kind: WidgetBody["kind"]) => player.filter((widget) => widget.body.kind === kind);
  const fallback = (view: WidgetView) => [view].filter((widget) => !emptyBody(widget.body));
  const track = kinds("track").length ? kinds("track") : fallback(synthesized("journal-track", "Quests", { kind: "track", main: parts.main, quests: parts.quests }));
  const log = kinds("log").length ? kinds("log") : fallback(synthesized("journal-log", "Log", { kind: "log", rows: parts.log }));
  const meters = kinds("meters");
  const statSheet = meters[0] ?? (parts.sheet.length ? synthesized("stat-sheet", "Stat sheet", { kind: "meters", groups: parts.sheet }) : null);
  return {
    player: {
      quests: parts.quests, mainLine: parts.main, sheet: parts.sheet, milestones: milestones(story, reader), log: parts.log, journal: [...track, ...log], statSheet,
      widgets: player.filter((widget) => widget.body.kind === "clock" || widget.body.kind === "board" || (widget.body.kind === "meters" && widget !== meters[0])),
    },
    authorWidgets: authored.filter((widget) => widget.audience === "author"),
  };
}

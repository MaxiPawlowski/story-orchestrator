import {
  checkAttempted, checkDice, checksAt, checksById, evaluateGate, isClosed, isOocLine, milestoneEarned, questStatus, stepStatus, valueReader, type BoundaryLogEntry, type EngineState,
  type GateReader, type NormalizedStoryV2, type PrimitiveValue, type Quality, type Quest, type QuestProgress, type StoryWidget, type WidgetIntent,
} from "@engine/index";
import { isRecord } from "@utils/guards";
import type {
  BoardLane, GameView, IntentView, LogRowView, MainLineView, MilestoneView, ProgressView, ProvenanceView, QuestLane, QuestView, RosterRowView, SheetGroupView, TimelineChapterView,
  WidgetBody, WidgetView,
} from "./gameTypes";
import { previousValues, sheetGroups } from "./gameSheet";
import { changedAgo, provenanceOf, shownItem } from "./widgetHistory";
import { checkLabel, type CheckRecord } from "./storyCheckDraws";
import { questMoveText } from "@features/gameCopy";

export const LOG_LIMIT = 40;
export const ACTION_CHARS = 140;
export const PLAYER_ACTOR = "You";

export interface GameSources {
  story: NormalizedStoryV2;
  state: EngineState;
  boundaryLog: readonly BoundaryLogEntry[];
  checks: readonly CheckRecord[];
  threads: { open: string[]; resolved: string[] };
  chat: readonly unknown[];
  castNames: Record<string, string>;
  authorView?: boolean;
}

export interface GameCompose {
  player: GameView;
  authorWidgets: WidgetView[];
  provenance: Record<string, ProvenanceView[]>;
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

const milestones = (story: NormalizedStoryV2, reader: GateReader): MilestoneView[] => (story.milestones ?? []).flatMap((milestone) => {
  const earned = milestoneEarned(milestone, reader);
  return earned || !milestone.secret ? [{ title: milestone.title, earned }] : [];
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
  if (!isRecord(row) || row.is_user !== true || row.is_system === true || messageId <= from || typeof row.mes !== "string" || !row.mes.trim() || isOocLine(row)) return [];
  const boundary = log.find((entry) => entry.context.lastMessageId >= messageId)?.boundary ?? (log.at(-1)?.boundary ?? 0);
  return [{ at: { boundary, messageId }, kind: "action", actor: PLAYER_ACTOR, text: firstLine(row.mes) }];
});

const composeLog = (sources: GameSources): LogRowView[] => {
  const from = sources.boundaryLog[0]?.before.lastMessageId ?? -1;
  return [...sources.boundaryLog.flatMap((entry) => statusMoves(sources.story, entry)), ...checkRows(sources.story, sources.checks), ...actionRows(sources.chat, from, sources.boundaryLog)]
    .sort((left, right) => right.at.messageId - left.at.messageId || right.at.boundary - left.at.boundary)
    .slice(0, LOG_LIMIT);
};

const meterQualities = (widget: StoryWidget | null, story: NormalizedStoryV2): Quality[] => {
  const bind = widget?.bind;
  if (!bind || !("quality" in bind || "qualities" in bind || "group" in bind)) return story.qualities.filter((quality) => quality.display);
  const grouped = (group: string) => story.qualities.filter((quality) => quality.display?.group === group).map((quality) => quality.key);
  const keys = "quality" in bind ? [bind.quality] : "qualities" in bind ? bind.qualities : grouped(bind.group);
  return keys.map((key) => story.qualityByKey[key]).filter((quality) => quality?.display);
};

const agoOf = (sources: GameSources) => (quality: Quality) => changedAgo(sources.boundaryLog, sources.chat, shownItem(quality));

const sheetOf = (qualities: Quality[], sources: GameSources): SheetGroupView[] =>
  sheetGroups(qualities, sources.state.blackboard.values, previousValues(sources.boundaryLog), agoOf(sources));

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
  const fill = (value: PrimitiveValue | undefined) => Math.min(segments, Math.max(0, (typeof value === "number" ? value : display.min ?? 0) - (display.min ?? 0)));
  const filled = fill(raw);
  const ago = changedAgo(sources.boundaryLog, sources.chat, (values) => String(fill(values[quality.key])));
  return { kind: "clock", label: display.label, filled, segments, full: filled >= segments, ...(ago !== undefined ? { changedAgo: ago } : {}) };
};

const statusText = (quality: Quality, value: PrimitiveValue | undefined, author: boolean): string =>
  (value === undefined ? "—" : quality.player_labels?.[String(value)] ?? (author ? String(value) : "—"));

const rosterBody = (widget: StoryWidget, sources: GameSources): WidgetBody => {
  const reader = valueReader(sources.state.blackboard.values);
  const author = widget.audience === "author";
  const rows = (widget.rows ?? []).flatMap((row): RosterRowView[] => {
    const quality = sources.story.qualityByKey[row.quality];
    const name = row.label ?? (row.member ? sources.castNames[row.member] : undefined);
    if (!quality || !name || (row.when && !evaluateGate(row.when, reader))) return [];
    const ago = changedAgo(sources.boundaryLog, sources.chat, (values) => statusText(quality, values[quality.key], author));
    return [{ name, status: statusText(quality, sources.state.blackboard.values[quality.key], author), ...(ago !== undefined ? { changedAgo: ago } : {}) }];
  });
  return { kind: "roster", rows };
};

const timelineBody = (widget: StoryWidget, story: NormalizedStoryV2, state: EngineState, before: EngineState | null): WidgetBody => {
  const earlier = before ? new Set([...before.visitedPath, before.activeCheckpointId]) : null;
  const ids = [...new Set([...state.visitedPath, state.activeCheckpointId])].filter((id) => story.checkpointById[id]?.player_name);
  const chapters = ids.reduce<TimelineChapterView[]>((groups, id) => {
    const chapterId = story.chapterByCheckpoint?.[id];
    const chapter = chapterId ? story.chapterById?.[chapterId] : undefined;
    const title = chapter ? chapter.player_title ?? chapter.title : null;
    const date = widget.dates?.[id];
    const stop = { name: story.checkpointById[id]?.player_name ?? "", ...(date ? { date } : {}), here: id === state.activeCheckpointId, fresh: Boolean(earlier && !earlier.has(id)) };
    const last = groups.at(-1);
    if (last && last.title === title) last.stops.push(stop);
    else groups.push({ title, stops: [stop] });
    return groups;
  }, []);
  return { kind: "timeline", chapters };
};

const intentOf = (intent: WidgetIntent, sources: GameSources): IntentView[] => {
  const base = { id: intent.id, text: intent.text };
  if (intent.open) return [{ ...base, open: intent.open }];
  if (!intent.check) return [base];
  const { story, state } = sources;
  const active = checksAt(story, state.activeCheckpointId).find(({ check }) => check.id === intent.check);
  if (!active?.transition || active.check.narrate !== "public" || checkAttempted(active, valueReader(state.blackboard.values))) return [];
  const dice = checkDice(active.check);
  return [{ ...base, roll: { label: checkLabel(story, active.check), dice: `${dice > 1 ? dice : ""}d${active.check.roll.sides}`, target: active.check.roll.target } }];
};

const intentsOf = (widget: StoryWidget, sources: GameSources): IntentView[] => (widget.actions ?? []).flatMap((intent) => intentOf(intent, sources));

const foundClues = (widget: StoryWidget, state: EngineState) => {
  const reader = valueReader(state.blackboard.values);
  return (widget.clues ?? []).filter((clue) => evaluateGate(clue.when, reader));
};

const cluesBody = (widget: StoryWidget, state: EngineState, before: EngineState | null): WidgetBody => {
  const found = foundClues(widget, state);
  const earlier = before ? new Set(foundClues(widget, before).map((clue) => clue.id)) : null;
  const index = new Map(found.map((clue, at) => [clue.id, at]));
  const links = (widget.links ?? []).flatMap((link) => {
    const from = index.get(link.from);
    const to = index.get(link.to);
    return from === undefined || to === undefined ? [] : [{ from, to, ...(link.label ? { label: link.label } : {}) }];
  });
  const clues = found.map((clue) => ({ text: clue.text, fresh: Boolean(earlier && !earlier.has(clue.id)), ...(clue.action ? { action: clue.action } : {}) }));
  return { kind: "clues", clues, links };
};

const shownPins = (widget: StoryWidget, state: EngineState) => {
  const reached = new Set(state.visitedPath);
  const reader = valueReader(state.blackboard.values);
  return (widget.pins ?? []).filter((pin) => (pin.checkpoint
    ? reached.has(pin.checkpoint) || state.activeCheckpointId === pin.checkpoint
    : Boolean(pin.when && evaluateGate(pin.when, reader))));
};

const mapBody = (widget: StoryWidget, state: EngineState, before: EngineState | null): WidgetBody => {
  const earlier = before ? new Set(shownPins(widget, before).map((pin) => pin.id)) : null;
  const pins = shownPins(widget, state).map((pin) => ({
    label: pin.label, x: pin.x, y: pin.y, here: pin.checkpoint === state.activeCheckpointId, fresh: Boolean(earlier && !earlier.has(pin.id)),
    ...(pin.action ? { action: pin.action } : {}),
  }));
  return { kind: "map", image: widget.image ?? "", pins };
};

const widgetBody = (widget: StoryWidget, sources: GameSources, parts: { quests: QuestView[]; sheet: SheetGroupView[]; main: MainLineView; log: LogRowView[] }): WidgetBody | null => {
  const limit = widget.options?.limit;
  const before = sources.boundaryLog.at(-1)?.before ?? null;
  if (widget.kind === "clues") return cluesBody(widget, sources.state, before);
  if (widget.kind === "map") return mapBody(widget, sources.state, before);
  if (widget.kind === "roster") return rosterBody(widget, sources);
  if (widget.kind === "timeline") return timelineBody(widget, sources.story, sources.state, before);
  if (widget.kind === "meters") return { kind: "meters", groups: widget.bind ? sheetOf(meterQualities(widget, sources.story), sources) : parts.sheet };
  if (widget.kind === "track") return widget.bind && "quests" in widget.bind ? { kind: "track", main: null, quests: parts.quests } : { kind: "track", main: parts.main, quests: [] };
  if (widget.kind === "log") return { kind: "log", rows: limit ? parts.log.slice(0, limit) : parts.log };
  if (widget.kind === "board") return { kind: "board", lanes: boardLanes(widget, parts.quests, sources.threads) };
  return clockBody(widget, sources);
};

const emptyBody = (body: WidgetBody): boolean =>
  (body.kind === "meters" && !body.groups.length) || (body.kind === "log" && !body.rows.length) || (body.kind === "board" && !body.lanes.length) || (body.kind === "clues" && !body.clues.length)
  || (body.kind === "track" && !body.quests.length && !body.main?.current && !body.main?.done.length)
  || (body.kind === "roster" && !body.rows.length) || (body.kind === "timeline" && !body.chapters.length);

const viewOf = (widget: StoryWidget, body: WidgetBody, actions: IntentView[], still: boolean): WidgetView => ({
  id: widget.id, title: widget.title, audience: widget.audience, synthesized: false, body, ...(widget.accent ? { accent: widget.accent } : {}), ...(widget.icon ? { icon: widget.icon } : {}),
  ...(actions.length && body.kind !== "html" ? { actions } : {}), ...(still ? { still: true as const } : {}),
});

const synthesized = (id: string, title: string, body: WidgetBody, still: boolean): WidgetView => ({
  id, title, audience: "player", synthesized: true, body, ...(still ? { still: true as const } : {}),
});

const valueKeys = (widget: StoryWidget, story: NormalizedStoryV2, body: WidgetBody): Array<{ label: string; key: string }> => {
  if (body.kind === "meters") return meterQualities(widget, story).map((quality) => ({ label: quality.display?.label ?? quality.key, key: quality.key }));
  if (body.kind === "clock" && widget.bind && "quality" in widget.bind) return [{ label: body.label, key: widget.bind.quality }];
  if (body.kind === "roster") return (widget.rows ?? []).map((row) => ({ label: row.label ?? row.member ?? row.id, key: row.quality }));
  return [];
};

const provenanceFor = (widgets: StoryWidget[], views: WidgetView[], sources: GameSources): Record<string, ProvenanceView[]> => {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const sheet = sources.story.qualities.filter((quality) => quality.display).map((quality) => ({ label: quality.display?.label ?? quality.key, key: quality.key }));
  return Object.fromEntries(views.flatMap((view) => {
    const shown = view.body.kind === "html" ? view.body.source : view;
    const widget = byId.get(shown.id);
    const keys = widget ? valueKeys(widget, sources.story, shown.body) : shown.body.kind === "meters" ? sheet : [];
    return keys.length ? [[view.id, keys.map(({ label, key }) => provenanceOf(sources.boundaryLog, label, key))]] : [];
  }));
};

export function composeGame(sources: GameSources): GameCompose {
  const { story, state } = sources;
  const values = state.blackboard.values;
  const reader = valueReader(values);
  const still = story.display?.motion === false;
  const parts = {
    quests: visibleQuests(story, reader, values, sources.castNames), sheet: sheetOf(story.qualities, sources),
    main: mainLine(story, state), log: composeLog(sources),
  };
  const visible = (story.widgets ?? []).filter((widget) => !widget.visible_when || evaluateGate(widget.visible_when, reader));
  const ordinary = visible.filter((widget) => widget.kind !== "html").flatMap((widget) => {
    const body = widgetBody(widget, sources, parts);
    return body && !emptyBody(body) ? [viewOf(widget, body, intentsOf(widget, sources), still)] : [];
  });
  const byId = new Map(ordinary.map((view) => [view.id, view]));
  const html = visible.flatMap((widget) => {
    const source = widget.kind === "html" && widget.source ? byId.get(widget.source) : undefined;
    return source && widget.template ? [viewOf(widget, { kind: "html", template: widget.template, actions: intentsOf(widget, sources), source }, [], still)] : [];
  });
  const backing = new Set(html.flatMap((view) => (view.body.kind === "html" ? [view.body.source.id] : [])));
  const authored = [...ordinary, ...html];
  const player = authored.filter((widget) => widget.audience === "player");
  const kinds = (kind: WidgetBody["kind"]) => player.filter((widget) => widget.body.kind === kind);
  const fallback = (view: WidgetView) => [view].filter((widget) => !emptyBody(widget.body));
  const track = kinds("track").length ? kinds("track") : fallback(synthesized("journal-track", "Quests", { kind: "track", main: parts.main, quests: parts.quests }, still));
  const log = kinds("log").length ? kinds("log") : fallback(synthesized("journal-log", "Log", { kind: "log", rows: parts.log }, still));
  const meters = kinds("meters");
  const statSheet = meters[0] ?? (parts.sheet.length ? synthesized("stat-sheet", "Stat sheet", { kind: "meters", groups: parts.sheet }, still) : null);
  const provenance = sources.authorView ? provenanceFor(story.widgets ?? [], [...authored, ...(statSheet?.synthesized ? [statSheet] : [])], sources) : {};
  return {
    player: {
      quests: parts.quests, mainLine: parts.main, sheet: parts.sheet, milestones: milestones(story, reader), log: parts.log, journal: [...track, ...log], statSheet,
      widgets: player.filter((widget) => !backing.has(widget.id) && (!["meters", "track", "log"].includes(widget.body.kind) || (widget.body.kind === "meters" && widget !== meters[0]))),
    },
    authorWidgets: authored.filter((widget) => widget.audience === "author" && !backing.has(widget.id)),
    provenance,
  };
}

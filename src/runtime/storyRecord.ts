import { appliedConsequences, factionMoveKey, questClosedKey, questEnding, type BoundaryLogEntry, type NormalizedStory } from "@engine/index";
import type { EchoesState } from "@engine/life/echoes";
import type { RumorsState } from "@memory/rumors/types";
import type { EffectLedgerRow } from "./effectTypes";
import type { CauseRef, EffectRef } from "./recapPort";

export type RecordEventKind = "transition" | "quest" | "resolution" | "consequence" | "faction-move" | "milestone" | "check" | "agenda" | "act" | "echo" | "rumor";
export type RecordAudience = "witnessed" | "told" | "not-told" | "unknown";

export interface RecordEvent {
  kind: RecordEventKind;
  id: string;
  to?: string;
}

export interface StoryRecordRow {
  boundary: number;
  messageId: number;
  event: RecordEvent;
  causes: CauseRef[];
  effects: string[];
  audience: Record<string, RecordAudience>;
  opens: string[];
  closes: string[];
}

export interface StoryRecordSources {
  story: NormalizedStory;
  log: readonly BoundaryLogEntry[];
  refs: readonly EffectRef[];
  ledger: readonly EffectLedgerRow[];
  echoes?: EchoesState | null;
  rumors?: RumorsState | null;
  roster: readonly string[];
}

export interface RecordRange {
  from?: number;
  to?: number;
}

const KIND_ORDER: readonly RecordEventKind[] = ["transition", "quest", "resolution", "consequence", "faction-move", "milestone", "check", "agenda", "act", "echo", "rumor"];
const LIFECYCLE: readonly string[] = ["hidden", "offered", "active"];

const inRange = (range: RecordRange) => (boundary: number): boolean => boundary >= (range.from ?? -Infinity) && boundary <= (range.to ?? Infinity);

const KIND_RANK = new Map(KIND_ORDER.map((kind, rank) => [kind, rank]));
const quietAudience = new WeakMap<readonly string[], Readonly<Record<string, RecordAudience>>>();

const unknownAudience = (roster: readonly string[], told: readonly string[] = []): Record<string, RecordAudience> => {
  if (told.length) return Object.fromEntries(roster.map((member) => [member, told.includes(member) ? "told" : "unknown"]));
  const known = quietAudience.get(roster);
  if (known) return known as Record<string, RecordAudience>;
  const made = Object.freeze(Object.fromEntries(roster.map((member) => [member, "unknown" as const])));
  quietAudience.set(roster, made);
  return made as Record<string, RecordAudience>;
};

const refRow = (ref: EffectRef, sources: StoryRecordSources): StoryRecordRow => {
  const questEnd = ref.kind === "quest" && ref.to !== undefined && !LIFECYCLE.includes(ref.to);
  const questOpen = ref.kind === "quest" && (ref.to === "offered" || ref.to === "active") && (ref.from === "hidden" || ref.from === undefined);
  const effects = !sources.ledger.length ? [] : ref.kind === "transition"
    ? sources.ledger.filter((row) => !row.origin && row.boundary === ref.boundary && row.checkpointId === ref.to).map((row) => row.id)
    : ref.kind === "agenda" ? sources.ledger.filter((row) => row.origin?.kind === "agenda" && row.origin.id === ref.id && row.origin.boundary === ref.boundary).map((row) => row.id) : [];
  return {
    boundary: ref.boundary, messageId: ref.messageId, event: { kind: questEnd ? "resolution" : ref.kind, id: ref.id, ...(ref.to ? { to: ref.to } : {}) },
    causes: [...ref.causes], effects, audience: unknownAudience(sources.roster),
    opens: questOpen ? [`quest:${ref.id}`] : [], closes: questEnd ? [`quest:${ref.id}`] : [],
  };
};

const consequenceRows = (entry: BoundaryLogEntry, sources: StoryRecordSources, causesOf: (questId: string) => CauseRef[]): StoryRecordRow[] => {
  const closed = (sources.story.quests ?? []).filter((quest) => entry.before.blackboard.values[questClosedKey(quest.id)] !== entry.after.blackboard.values[questClosedKey(quest.id)]);
  return closed.length ? closedConsequenceRows(entry, sources, causesOf, closed) : [];
};

const closedConsequenceRows = (entry: BoundaryLogEntry, sources: StoryRecordSources, causesOf: (questId: string) => CauseRef[], quests: NonNullable<NormalizedStory["quests"]>): StoryRecordRow[] =>
  appliedConsequences({ quests }, entry.after.blackboard.values).filter((item) => entry.before.blackboard.values[item.key] === undefined).map((item) => {
    const id = `${item.questId}:${item.resolutionId}:${item.consequence.id}`;
    return {
      boundary: entry.boundary, messageId: entry.context.lastMessageId, event: { kind: "consequence" as const, id, to: item.resolutionId },
      causes: item.consequence.when ? [] : causesOf(item.questId),
      effects: sources.ledger.filter((row) => row.origin?.kind === "quest" && row.origin.id === id && row.origin.boundary === entry.boundary).map((row) => row.id),
      audience: unknownAudience(sources.roster), opens: [], closes: [],
    };
  });

const movedFactions = (entry: BoundaryLogEntry, sources: StoryRecordSources) =>
  (entry.before.blackboard.values === entry.after.blackboard.values ? [] : sources.story.factions ?? []);

const factionRows = (entry: BoundaryLogEntry, sources: StoryRecordSources): StoryRecordRow[] => movedFactions(entry, sources).flatMap((faction) => faction.moves.flatMap((move) => {
  const key = factionMoveKey(faction.id, move.id);
  return entry.before.blackboard.values[key] === undefined && entry.after.blackboard.values[key] !== undefined ? [{
    boundary: entry.boundary, messageId: entry.context.lastMessageId, event: { kind: "faction-move" as const, id: `${faction.id}:${move.id}` },
    causes: [], effects: [], audience: unknownAudience(sources.roster), opens: [], closes: [],
  }] : [];
}));

const echoRows = (sources: StoryRecordSources, within: (boundary: number) => boolean): StoryRecordRow[] => (sources.echoes?.events ?? []).flatMap((event) =>
  (event.landedAt && within(event.landedAt.boundary) ? [{
    boundary: event.landedAt.boundary, messageId: event.landedAt.messageId, event: { kind: "echo" as const, id: event.echoId },
    causes: [], effects: [], audience: unknownAudience(sources.roster, [event.recipient]), opens: [], closes: [`echo:${event.occurrenceId}`],
  }] : []));

const rumorRows = (sources: StoryRecordSources, within: (boundary: number) => boolean): StoryRecordRow[] => (sources.rumors?.events ?? []).flatMap((event) =>
  (event.landedAt && within(event.landedAt.boundary) ? [{
    boundary: event.landedAt.boundary, messageId: event.landedAt.messageId, event: { kind: "rumor" as const, id: event.rumorId, to: event.to },
    causes: [], effects: [], audience: unknownAudience(sources.roster, [event.to]), opens: [], closes: [],
  }] : []));

const echoOpens = (rows: StoryRecordRow[], sources: StoryRecordSources): void => {
  for (const event of sources.echoes?.events ?? []) {
    const host = rows.find((row) => row.boundary === event.scheduledAt.boundary && row.event.kind !== "echo" && row.event.kind !== "rumor");
    if (host) host.opens.push(`echo:${event.occurrenceId}`);
  }
};

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export function buildStoryRecord(sources: StoryRecordSources, range: RecordRange = {}): StoryRecordRow[] {
  const within = inRange(range);
  const refs = sources.refs.filter((ref) => within(ref.boundary));
  const resolutionCauses = (boundary: number) => (questId: string): CauseRef[] =>
    refs.find((ref) => ref.kind === "quest" && ref.id === questId && ref.boundary === boundary && ref.to !== undefined && !LIFECYCLE.includes(ref.to))?.causes ?? [];
  const logged = sources.log.filter((entry) => within(entry.boundary));
  const rows = [
    ...refs.map((ref) => refRow(ref, sources)),
    ...logged.flatMap((entry) => [...consequenceRows(entry, sources, resolutionCauses(entry.boundary)), ...factionRows(entry, sources)]),
    ...echoRows(sources, within), ...rumorRows(sources, within),
  ].sort((left, right) => left.boundary - right.boundary || (KIND_RANK.get(left.event.kind) ?? 0) - (KIND_RANK.get(right.event.kind) ?? 0) || compare(left.event.id, right.event.id));
  echoOpens(rows, sources);
  return rows;
}

export const openItems = (rows: readonly StoryRecordRow[]): string[] => {
  const open = new Set<string>();
  for (const row of rows) {
    row.opens.forEach((item) => open.add(item));
    row.closes.forEach((item) => open.delete(item));
  }
  return [...open];
};

export const restingRecord = (rows: readonly StoryRecordRow[], label: (row: StoryRecordRow) => string, keep: (text: string) => string): Array<StoryRecordRow & { text: string }> =>
  rows.flatMap((row) => {
    const text = label(row);
    const kept = keep(text);
    return kept === text ? [{ ...row, causes: row.causes.map((cause) => ({ ...cause })), text }] : [];
  });

const questTitle = (story: NormalizedStory, id: string): string => (story.quests ?? []).find((quest) => quest.id === id)?.title ?? id;

export const recordLabel = (story: NormalizedStory, row: StoryRecordRow): string => {
  const { kind, id, to } = row.event;
  if (kind === "transition") return `Reached ${story.checkpointById[to ?? ""]?.name ?? to ?? id}`;
  if (kind === "quest") return `${questTitle(story, id)}: ${to ?? "moved"}`;
  if (kind === "resolution") {
    const quest = (story.quests ?? []).find((candidate) => candidate.id === id);
    return `${questTitle(story, id)} closed: ${(quest ? questEnding(quest, to ?? null)?.label : undefined) ?? to}`;
  }
  if (kind === "consequence") {
    const [questId, resolutionId, consequenceId] = id.split(":");
    const quest = (story.quests ?? []).find((candidate) => candidate.id === questId);
    const consequence = quest ? questEnding(quest, resolutionId)?.consequences.find((item) => item.id === consequenceId) : undefined;
    return `${questTitle(story, questId)} (${resolutionId}): ${consequence?.label ?? consequenceId}`;
  }
  if (kind === "faction-move") {
    const [factionId, moveId] = id.split(":");
    return `${(story.factions ?? []).find((faction) => faction.id === factionId)?.name ?? factionId}: ${moveId}`;
  }
  if (kind === "milestone") return `Milestone: ${(story.milestones ?? []).find((milestone) => milestone.id === id)?.title ?? id}`;
  if (kind === "check") return `Check ${id}: ${to ?? ""}`.trim();
  if (kind === "echo") return `Echo ${id} landed`;
  if (kind === "rumor") return `Rumor ${id} reached ${to ?? "someone"}`;
  return `${kind}: ${id}`;
};

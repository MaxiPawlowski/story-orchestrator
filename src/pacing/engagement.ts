import { LABEL_REVEAL_PREFIX, LABEL_SHOWN_PREFIX, PARTY_LOCATION_KEY, PLAYER_REF, QUIET_WINDOW_TURNS, type BoundaryLogEntry, type PrimitiveValue } from "@engine/index";
import { relaxDrop, type TensionPoint } from "./arc";

export const ENGAGEMENT_CLASSES = ["aftermath", "pressure-advancing", "exploring-relationship", "uncertain", "repeating"] as const;
export type EngagementClass = typeof ENGAGEMENT_CLASSES[number];

export const AFTERMATH_BOUNDARIES = 2;
export const ENGAGEMENT_RING_LIMIT = 50;

export interface PressureCrossing {
  label: string;
  messageId: number;
  cue?: string;
}

export interface PlayerTurn {
  id: number;
  text: string;
}

export interface EngagementInput {
  log: readonly Pick<BoundaryLogEntry, "context" | "before" | "after">[];
  playerTurns: readonly PlayerTurn[];
  memoryIds: readonly number[];
  relationEvents: readonly number[];
  tension: readonly TensionPoint[];
  resolutions?: readonly number[];
  pressures?: readonly PressureCrossing[];
  lastMessageId: number;
  window?: number;
}

export interface EngagementReading {
  at: number;
  kind: EngagementClass | null;
  matched: EngagementClass[];
  pressure: PressureCrossing | null;
}

type Values = Readonly<Record<string, PrimitiveValue>>;

const RELATION_PREFIXES = ["rel_", "mood_", LABEL_REVEAL_PREFIX, LABEL_SHOWN_PREFIX];

export const isRelationKey = (key: string): boolean => RELATION_PREFIXES.some((prefix) => key.startsWith(prefix));

const relationMoved = (before: Values, after: Values): boolean =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].some((key) => isRelationKey(key) && before[key] !== after[key]);

const asksQuestion = (text: string): boolean => text.includes("?");

const recentBoundaryFloor = (log: EngagementInput["log"]): number => {
  const recent = log.slice(-AFTERMATH_BOUNDARIES);
  return recent.length ? recent[0].context.lastMessageId : Number.POSITIVE_INFINITY;
};

const aftermath = (input: EngagementInput): boolean => {
  const floor = recentBoundaryFloor(input.log);
  if ((input.resolutions ?? []).some((id) => id >= floor && id <= input.lastMessageId)) return true;
  const drop = relaxDrop(input.tension);
  return Boolean(drop && drop.messageId >= floor);
};

const latestPressure = (input: EngagementInput, from: number): PressureCrossing | null =>
  [...(input.pressures ?? [])].filter((row) => row.messageId >= from && row.messageId <= input.lastMessageId).sort((a, b) => b.messageId - a.messageId)[0] ?? null;

const repeating = (input: EngagementInput, inside: EngagementInput["log"], from: number, turns: readonly PlayerTurn[], window: number): boolean => {
  if (turns.length < window || input.memoryIds.some((id) => id >= from && id <= input.lastMessageId)) return false;
  const places = new Set(inside.flatMap((entry) => [entry.before.blackboard.values[PARTY_LOCATION_KEY], entry.after.blackboard.values[PARTY_LOCATION_KEY]]));
  return places.size <= 1;
};

export const readEngagement = (input: EngagementInput): EngagementReading => {
  const window = Math.max(1, input.window ?? QUIET_WINDOW_TURNS);
  const turns = input.playerTurns.filter((turn) => turn.id <= input.lastMessageId).slice(-window);
  const from = turns[0]?.id ?? input.lastMessageId;
  const inside = input.log.filter((entry) => entry.context.lastMessageId >= from && entry.context.lastMessageId <= input.lastMessageId);
  const pressure = latestPressure(input, from);
  const hits: Record<EngagementClass, boolean> = {
    aftermath: aftermath(input),
    "pressure-advancing": Boolean(pressure),
    "exploring-relationship": inside.some((entry) => relationMoved(entry.before.blackboard.values, entry.after.blackboard.values))
      || input.relationEvents.some((id) => id >= from && id <= input.lastMessageId),
    uncertain: Boolean(turns.length && asksQuestion(turns[turns.length - 1].text)),
    repeating: repeating(input, inside, from, turns, window),
  };
  const matched = ENGAGEMENT_CLASSES.filter((kind) => hits[kind]);
  return { at: input.lastMessageId, kind: matched[0] ?? null, matched, pressure };
};

export const holdsPush = (reading: EngagementReading | null): boolean => reading?.kind === "aftermath" || reading?.kind === "exploring-relationship";

export const AFTERMATH_LINE = `Aftermath: something just came to a head. Let people react to it and catch their breath; no new push this reply. `
  + `${PLAYER_REF} decides what comes next.`;

export const pressureLine = (pressure: PressureCrossing): string =>
  `${pressure.label} has moved on. Show what it costs now, through something that happens in the scene${pressure.cue ? ` (${pressure.cue.trim()})` : ""}; `
    + `never resolve it for ${PLAYER_REF} and never decide what ${PLAYER_REF} does.`;

export const stuckInfoLine = (lead: string | null): string => (lead
  ? `${PLAYER_REF} seems unsure. If it fits, let someone or something offer this as plain information, not pressure; ${PLAYER_REF} may take it up or ignore it: ${lead.trim()}`
  : `${PLAYER_REF} seems unsure. If it fits, let the scene answer what ${PLAYER_REF} asked with one concrete piece of information; never decide what ${PLAYER_REF} does.`);

export const recordEngagement = (ring: readonly EngagementReading[], reading: EngagementReading): EngagementReading[] =>
  [...ring.filter((row) => row.at !== reading.at), reading].sort((a, b) => a.at - b.at).slice(-ENGAGEMENT_RING_LIMIT);

export const rollbackEngagement = (ring: readonly EngagementReading[], messageId: number): EngagementReading[] => ring.filter((row) => row.at < messageId);

import { evaluateGate } from "../gates";
import { chanceSeed, unitDraw } from "../chance";
import type { BoundaryLogEntry } from "../engine";
import type { GateNode, NormalizedStory, PrimitiveValue } from "../schema";
import { milestoneEarned, questStatus } from "../quests";
import {
  ECHO_EVENTS_CAP, ECHO_LANDINGS_PER_BOUNDARY, ECHO_NARRATOR, echoExpiry, echoHold, echoRange, echoSourceId, echoSourceKind, echoSourceTo, echoUnit,
  type StoryEcho,
} from "../echoSchema";
import { transitionIds } from "../validate/echoes";
import { currentTime } from "./clock";
import { byDue, dueNow, span, type Due } from "./due";
import { fnv1a } from "@utils/fnv";
import { isRecord } from "@utils/guards";

type Values = Readonly<Record<string, PrimitiveValue>>;

export interface EchoAt {
  boundary: number;
  messageId: number;
}

export type EchoStatus = "scheduled" | "landed" | "cancelled" | "expired" | "lapsed";
export type EchoTerminal = Exclude<EchoStatus, "scheduled">;
export type EchoDue = Extract<Due, { boundary: number } | { part: number }>;
export type EchoWait = "when" | "recipient" | "secret" | "unknown-name" | "capacity";

export interface EchoSourceRef {
  kind: "transition" | "quest" | "milestone" | "check";
  id: string;
  to: string | null;
  boundary: number;
  messageId: number;
}

export interface EchoEvent {
  occurrenceId: string;
  echoId: string;
  identity: string;
  revision: string;
  recipient: string;
  source: EchoSourceRef;
  scheduledAt: EchoAt;
  due: EchoDue;
  status: EchoStatus;
  landedAt?: EchoAt;
  offerId?: string;
  closedAt?: EchoAt;
}

export interface SettledEcho {
  echoId: string;
  identity: string;
  occurrenceId: string;
  revision: string;
  status: EchoTerminal;
  closedAt: EchoAt;
}

export interface EchoGap {
  from: number;
  to: number;
  reason: "log" | "checks";
}

export interface EchoesState {
  events: EchoEvent[];
  settled: SettledEcho[];
  gaps: EchoGap[];
  scannedTo: number;
}

export interface EchoCheckRecord {
  checkId: string;
  boundary: number;
  outcome: string;
}

export type EchoRefusal = "secret" | "unknown-name";

export interface EchoStepInput {
  state: EchoesState;
  story: NormalizedStory;
  log: readonly BoundaryLogEntry[];
  checks: readonly EchoCheckRecord[];
  checksComplete: boolean;
  values: Values;
  at: EchoAt;
  chatId: string;
  storyId: string;
  enabled: readonly string[];
  refuse: (text: string, recipient: string) => EchoRefusal | null;
  horizonMessageId?: number | null;
}

export interface EchoStepResult {
  state: EchoesState;
  scheduled: EchoEvent[];
  landed: EchoEvent[];
  waiting: Array<{ event: EchoEvent; reason: EchoWait }>;
  cancelled: EchoEvent[];
  expired: EchoEvent[];
  gaps: EchoGap[];
}

export const createEchoes = (): EchoesState => ({ events: [], settled: [], gaps: [], scannedTo: 0 });

const rev = (parts: unknown[]): string => fnv1a(JSON.stringify(parts));

export const echoIdentity = (echo: StoryEcho): string => rev(["echo", echo.id, echo.after, echo.to, echoUnit(echo.delay)]);

export const echoRevision = (echo: StoryEcho): string =>
  rev([echoIdentity(echo), echoRange(echo.delay), echo.when ?? null, echo.cancel_when ?? null, echoExpiry(echo), echoHold(echo)]);

export const echoOfferKey = (occurrenceId: string): string => `echo:${occurrenceId}`;

const holds = (gate: GateNode | undefined, values: Values): boolean => !gate || evaluateGate(gate, { get: (key) => values[key] });

const consumedKey = (echoId: string, identity: string) => `${echoId}|${identity}`;

export const echoRecipient = (story: Pick<NormalizedStory, "roster">, echo: Pick<StoryEcho, "to">): string | null =>
  (echo.to === ECHO_NARRATOR ? story.roster.find((member) => member.view === "omniscient")?.id ?? null : story.roster.find((member) => member.id === echo.to)?.id ?? null);

export const echoDefinition = (story: Pick<NormalizedStory, "echoes">, event: Pick<EchoEvent, "echoId" | "identity">): StoryEcho | null =>
  story.echoes?.find((echo) => echo.id === event.echoId && echoIdentity(echo) === event.identity) ?? null;

export const storyClock = (story: Pick<NormalizedStory, "clock">, values: Values): number | null => (story.clock ? currentTime(story.clock, values) : null);

const firedTransition = (story: NormalizedStory, entry: BoundaryLogEntry): string | null => {
  if (!entry.fired || entry.source !== "gate") return null;
  return transitionIds(story.transitions)[entry.fired.declarationIndex] ?? null;
};

const sourceHappened = (story: NormalizedStory, echo: StoryEcho, entry: BoundaryLogEntry, checks: readonly EchoCheckRecord[]): boolean => {
  const after = echo.after;
  const before = { get: (key: string) => entry.before.blackboard.values[key] };
  const now = { get: (key: string) => entry.after.blackboard.values[key] };
  if ("transition" in after) return firedTransition(story, entry) === after.transition;
  if ("quest" in after) {
    const quest = story.quests?.find((entry) => entry.id === after.quest);
    return Boolean(quest && questStatus(quest, before) !== after.to && questStatus(quest, now) === after.to);
  }
  if ("milestone" in after) {
    const milestone = story.milestones?.find((entry) => entry.id === after.milestone);
    return Boolean(milestone && !milestoneEarned(milestone, before) && milestoneEarned(milestone, now));
  }
  return checks.some((record) => record.boundary === entry.boundary && record.checkId === after.check && record.outcome === after.outcome);
};

export const echoOccurrenceId = (parts: { chatId: string; storyId: string; echo: StoryEcho; boundary: number }): string => {
  const key = [parts.chatId, parts.storyId, parts.echo.id, echoSourceKind(parts.echo.after), echoSourceId(parts.echo.after), echoSourceTo(parts.echo.after) ?? "", parts.boundary];
  return `e${chanceSeed(key).toString(36)}${chanceSeed([...key, "occurrence"]).toString(36)}`;
};

const scheduleFrom = (input: EchoStepInput, echo: StoryEcho, entry: BoundaryLogEntry, recipient: string): EchoEvent => {
  const occurrenceId = echoOccurrenceId({ chatId: input.chatId, storyId: input.storyId, echo, boundary: entry.boundary });
  const drawn = span(echoRange(echo.delay), unitDraw([input.chatId, input.storyId, occurrenceId, "delay"]));
  const sourceTime = storyClock(input.story, entry.after.blackboard.values) ?? 0;
  const due: EchoDue = echoUnit(echo.delay) === "parts" ? { part: sourceTime + drawn } : { boundary: entry.boundary + Math.max(1, drawn) };
  const at = { boundary: entry.boundary, messageId: entry.context.lastMessageId };
  return {
    occurrenceId, echoId: echo.id, identity: echoIdentity(echo), revision: echoRevision(echo), recipient,
    source: { kind: echoSourceKind(echo.after), id: echoSourceId(echo.after), to: echoSourceTo(echo.after), ...at },
    scheduledAt: input.at, due, status: "scheduled",
  };
};

const scanRange = (input: EchoStepInput): { start: number; gaps: EchoGap[] } => {
  const from = input.state.scannedTo + 1;
  const to = input.at.boundary;
  const gaps: EchoGap[] = [];
  let start = from;
  const logFirst = input.log.length ? input.log[0].boundary : to + 1;
  if (start <= to && logFirst > start) {
    gaps.push({ from: start, to: Math.min(to, logFirst - 1), reason: "log" });
    start = logFirst;
  }
  const checkSourced = (input.story.echoes ?? []).some((echo) => "check" in echo.after);
  const checksFrom = !input.checksComplete && input.checks.length ? input.checks[0].boundary + 1 : start;
  if (checkSourced && start <= to && checksFrom > start) {
    gaps.push({ from: start, to: Math.min(to, checksFrom - 1), reason: "checks" });
    start = checksFrom;
  }
  return { start, gaps };
};

const scan = (input: EchoStepInput, events: EchoEvent[], start: number): EchoEvent[] => {
  const consumed = new Set([...input.state.settled, ...events].map((row) => consumedKey(row.echoId, row.identity)));
  const known = new Set(events.map((event) => event.occurrenceId));
  const scheduled: EchoEvent[] = [];
  input.log.filter((entry) => entry.boundary >= start && entry.boundary <= input.at.boundary).forEach((entry) => {
    (input.story.echoes ?? []).forEach((echo) => {
      const recipient = echoRecipient(input.story, echo);
      if (!recipient || consumed.has(consumedKey(echo.id, echoIdentity(echo))) || !sourceHappened(input.story, echo, entry, input.checks)) return;
      const event = scheduleFrom(input, echo, entry, recipient);
      if (known.has(event.occurrenceId)) return;
      consumed.add(consumedKey(echo.id, event.identity));
      known.add(event.occurrenceId);
      scheduled.push(event);
    });
  });
  return scheduled;
};

const reached = (event: EchoEvent, at: EchoAt, clock: number | null): boolean =>
  at.boundary > event.source.boundary && dueNow(event.due, at.boundary, "part" in event.due ? clock : null);

const pastExpiry = (event: EchoEvent, echo: StoryEcho, at: EchoAt, clock: number | null): boolean => {
  const window = echoExpiry(echo);
  if ("boundary" in event.due) return at.boundary > event.due.boundary + window;
  return clock !== null && clock > event.due.part + window;
};

export const echoWaitReason = (input: Pick<EchoStepInput, "values" | "enabled" | "refuse">, event: EchoEvent, echo: StoryEcho): EchoWait | null => {
  if (!holds(echo.when, input.values)) return "when";
  if (!input.enabled.includes(event.recipient)) return "recipient";
  return input.refuse(echo.cue, event.recipient);
};

const close = (event: EchoEvent, status: EchoTerminal, at: EchoAt): EchoEvent => ({ ...event, status, closedAt: at });

const evict = (state: EchoesState, horizon: number | null | undefined): EchoesState => {
  const overflow = state.events.length - ECHO_EVENTS_CAP;
  if (overflow <= 0 || horizon === null || horizon === undefined) return state;
  const old = state.events.filter((event) => event.status !== "scheduled" && event.closedAt && event.closedAt.messageId < horizon).slice(0, overflow);
  if (!old.length) return state;
  const gone = new Set(old);
  const settled = old.map((event): SettledEcho => ({
    echoId: event.echoId, identity: event.identity, occurrenceId: event.occurrenceId, revision: event.revision, status: event.status as EchoTerminal, closedAt: event.closedAt as EchoAt,
  }));
  return { ...state, events: state.events.filter((event) => !gone.has(event)), settled: [...state.settled, ...settled] };
};

const sameGap = (left: EchoGap, right: EchoGap) => left.from === right.from && left.to === right.to && left.reason === right.reason;

export function stepEchoes(input: EchoStepInput): EchoStepResult {
  const { start, gaps } = scanRange(input);
  const scheduled = input.at.boundary >= start ? scan(input, input.state.events, start) : [];
  const events = [...input.state.events, ...scheduled];
  const clock = storyClock(input.story, input.values);
  const result: Omit<EchoStepResult, "state" | "scheduled" | "gaps"> = { landed: [], waiting: [], cancelled: [], expired: [] };
  const eligible: EchoEvent[] = [];
  events.filter((event) => event.status === "scheduled").sort(byDue).forEach((event) => {
    const echo = echoDefinition(input.story, event);
    if (!echo) return;
    const index = events.indexOf(event);
    if (echo.cancel_when && holds(echo.cancel_when, input.values)) {
      events[index] = close(event, "cancelled", input.at);
      result.cancelled.push(events[index]);
    } else if (pastExpiry(event, echo, input.at, clock)) {
      events[index] = close(event, "expired", input.at);
      result.expired.push(events[index]);
    } else if (reached(event, input.at, clock)) {
      const reason = echoWaitReason(input, event, echo);
      if (reason) result.waiting.push({ event, reason });
      else eligible.push(event);
    }
  });
  eligible.forEach((event, rank) => {
    if (rank >= ECHO_LANDINGS_PER_BOUNDARY) {
      result.waiting.push({ event, reason: "capacity" });
      return;
    }
    const index = events.indexOf(event);
    events[index] = { ...event, status: "landed", landedAt: input.at, offerId: echoOfferKey(event.occurrenceId) };
    result.landed.push(events[index]);
  });
  const fresh = gaps.filter((gap) => !input.state.gaps.some((row) => sameGap(row, gap)));
  const state = evict({ events, settled: input.state.settled, gaps: [...input.state.gaps, ...fresh], scannedTo: Math.max(input.state.scannedTo, input.at.boundary) }, input.horizonMessageId);
  return { state, scheduled, gaps: fresh, ...result };
}

export const closeLapsedEcho = (state: EchoesState, offerId: string, at: EchoAt): EchoesState | null => {
  const index = state.events.findIndex((event) => event.offerId === offerId && event.status === "landed");
  if (index < 0) return null;
  const events = [...state.events];
  events[index] = close(events[index], "lapsed", at);
  return { ...state, events };
};

const reopen = (event: EchoEvent, messageId: number): EchoEvent => {
  if (event.landedAt && event.landedAt.messageId >= messageId) {
    const { landedAt: _landed, offerId: _offer, closedAt: _closed, ...pending } = event;
    return { ...pending, status: "scheduled" };
  }
  if (event.closedAt && event.closedAt.messageId >= messageId) {
    const { closedAt: _closed, ...open } = event;
    return { ...open, status: open.landedAt ? "landed" : "scheduled" };
  }
  return event;
};

export const rollbackEchoes = (state: EchoesState, messageId: number, keptBoundary: number): EchoesState => ({
  events: state.events.filter((event) => event.source.messageId < messageId).map((event) => reopen(event, messageId)),
  settled: state.settled.filter((row) => row.closedAt.messageId < messageId),
  gaps: state.gaps.filter((gap) => gap.from <= keptBoundary).map((gap) => ({ ...gap, to: Math.min(gap.to, keptBoundary) })),
  scannedTo: Math.min(state.scannedTo, keptBoundary),
});

const STATUSES: readonly string[] = ["scheduled", "landed", "cancelled", "expired", "lapsed"];
const isAt = (value: unknown): value is EchoAt => isRecord(value) && Number.isSafeInteger(value.boundary) && Number.isSafeInteger(value.messageId);
const isDue = (value: unknown): value is EchoDue => isRecord(value) && (Number.isSafeInteger(value.boundary) || Number.isSafeInteger(value.part));
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const isEvent = (value: unknown): value is EchoEvent => isRecord(value) && typeof value.occurrenceId === "string" && typeof value.echoId === "string"
  && typeof value.identity === "string" && typeof value.revision === "string" && typeof value.recipient === "string" && STATUSES.includes(String(value.status))
  && isRecord(value.source) && Number.isSafeInteger(value.source.messageId) && Number.isSafeInteger(value.source.boundary) && isAt(value.scheduledAt) && isDue(value.due)
  && (value.landedAt === undefined || isAt(value.landedAt)) && (value.closedAt === undefined || isAt(value.closedAt));

const isSettled = (value: unknown): value is SettledEcho => isRecord(value) && typeof value.echoId === "string" && typeof value.identity === "string"
  && typeof value.occurrenceId === "string" && STATUSES.includes(String(value.status)) && value.status !== "scheduled" && isAt(value.closedAt);

const isGap = (value: unknown): value is EchoGap => isRecord(value) && Number.isSafeInteger(value.from) && Number.isSafeInteger(value.to) && (value.reason === "log" || value.reason === "checks");

export const sanitizeEchoes = (value: unknown): EchoesState => (isRecord(value) ? {
  events: list(value.events).filter(isEvent),
  settled: list(value.settled).filter(isSettled),
  gaps: list(value.gaps).filter(isGap),
  scannedTo: Number.isSafeInteger(value.scannedTo) && (value.scannedTo as number) >= 0 ? value.scannedTo as number : 0,
} : createEchoes());

export const reconcileEchoes = (state: EchoesState | undefined, previous: Pick<NormalizedStory, "echoes">, next: Pick<NormalizedStory, "echoes">): EchoesState | undefined => {
  if (!state) return state;
  const defs = new Map((next.echoes ?? []).map((echo) => [echo.id, echo]));
  let scannedTo = state.scannedTo;
  const events = state.events.filter((event) => {
    if (event.status !== "scheduled") return true;
    const echo = defs.get(event.echoId);
    if (echo && echoIdentity(echo) === event.identity && echoRevision(echo) === event.revision) return true;
    scannedTo = Math.min(scannedTo, event.source.boundary - 1);
    return false;
  });
  const before = new Set((previous.echoes ?? []).map(echoIdentity));
  if ((next.echoes ?? []).some((echo) => !before.has(echoIdentity(echo)))) scannedTo = 0;
  return events.length === state.events.length && scannedTo === state.scannedTo ? state : { ...state, events, scannedTo: Math.max(0, scannedTo) };
};

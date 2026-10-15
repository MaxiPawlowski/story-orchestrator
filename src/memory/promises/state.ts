import { isRecord } from "@utils/guards";
import { isSourceSpan, type SpanAudienceOf } from "../audience";
import {
  PROMISE_EVENT_KINDS, type OpenPromiseRef, type PlayerPromise, type PromiseEvent, type PromiseRow, type PromisesState, type PromiseStatus, type QuestStatusOf,
} from "./types";

export const createPromises = (): PromisesState => ({ rows: [] });

const isBoundary = (value: unknown): value is { boundary: number } => isRecord(value) && Number.isSafeInteger(value.boundary);

const sanitizeEvent = (value: unknown): PromiseEvent | null => {
  if (!isRecord(value) || typeof value.eventId !== "string" || typeof value.quote !== "string" || !isSourceSpan(value.source) || !isBoundary(value.at)) return null;
  if (!(PROMISE_EVENT_KINDS as readonly unknown[]).includes(value.kind)) return null;
  return { eventId: value.eventId, kind: value.kind as PromiseEvent["kind"], quote: value.quote, source: value.source, at: { boundary: value.at.boundary } };
};

const sanitizeRow = (value: unknown): PromiseRow | null => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.promisee !== "string" || typeof value.quote !== "string") return null;
  if (!isSourceSpan(value.source) || !isBoundary(value.madeAt)) return null;
  const deadline = isRecord(value.deadline) && typeof value.deadline.text === "string" && isSourceSpan(value.deadline.source)
    ? { text: value.deadline.text, source: value.deadline.source, ...(Number.isSafeInteger(value.deadline.dueDay) ? { dueDay: value.deadline.dueDay as number } : {}) }
    : null;
  return {
    id: value.id, promisee: value.promisee, quote: value.quote, source: value.source, madeAt: { boundary: value.madeAt.boundary },
    events: Array.isArray(value.events) ? value.events.map(sanitizeEvent).filter((event): event is PromiseEvent => event !== null) : [],
    ...(deadline ? { deadline } : {}), ...(value.conditional === true ? { conditional: true as const } : {}),
    ...(typeof value.questId === "string" ? { questId: value.questId } : {}),
  };
};

export const sanitizePromises = (value: unknown): PromisesState => ({
  rows: isRecord(value) && Array.isArray(value.rows) ? value.rows.map(sanitizeRow).filter((row): row is PromiseRow => row !== null) : [],
});

export const shownQuote = (row: PromiseRow): string => [...row.events].reverse().find((event) => event.kind === "renegotiated")?.quote ?? row.quote;

export const promiseStatus = (row: PromiseRow, questStatus?: QuestStatusOf): PromiseStatus => {
  if (row.questId) {
    const status = questStatus?.(row.questId) ?? null;
    return status === "done" ? "kept" : status === "failed" ? "broken" : "open";
  }
  const last = row.events[row.events.length - 1];
  return !last || last.kind === "renegotiated" ? "open" : last.kind;
};

export const openRows = (state: PromisesState | undefined, questStatus?: QuestStatusOf): PromiseRow[] =>
  (state?.rows ?? []).filter((row) => promiseStatus(row, questStatus) === "open");

export const openPromiseRefs = (state: PromisesState | undefined, nameOf: (rosterId: string) => string): OpenPromiseRef[] =>
  openRows(state).filter((row) => !row.questId).map((row) => ({ id: row.id, promisee: nameOf(row.promisee), quote: shownQuote(row) }));

export const rollbackPromises = (state: PromisesState, messageId: number): PromisesState => ({
  rows: state.rows.filter((row) => row.source.messageId < messageId).map((row) => {
    const events = row.events.filter((event) => event.source.messageId < messageId);
    return events.length === row.events.length ? row : { ...row, events };
  }),
});

const closedAt = (row: PromiseRow): number => row.events[row.events.length - 1]?.source.messageId ?? row.source.messageId;

export const evictPromises = (state: PromisesState, horizonMessageId: number | null): PromisesState => {
  if (horizonMessageId === null) return state;
  const evicted = state.rows.filter((row) => promiseStatus(row) !== "open" && !row.questId && closedAt(row) < horizonMessageId);
  return evicted.length ? { rows: state.rows.filter((row) => !evicted.includes(row)) } : state;
};

export const playerPromises = (state: PromisesState | undefined, nameOf: (rosterId: string) => string, questStatus?: QuestStatusOf,
  questTitle?: (questId: string) => string | undefined): PlayerPromise[] =>
  openRows(state, questStatus).filter((row) => !row.conditional).map((row) => {
    const title = row.questId ? questTitle?.(row.questId) : undefined;
    return { id: row.id, promisee: nameOf(row.promisee), quote: shownQuote(row), ...(row.deadline ? { deadline: row.deadline.text } : {}), ...(title ? { questTitle: title } : {}) };
  });

export const promiseHooks = (state: PromisesState | undefined, audience: SpanAudienceOf, nameOf: (rosterId: string) => string): string[] =>
  openRows(state).filter((row) => !row.conditional && audience(row.source) === "all-present")
    .map((row) => `${nameOf(row.promisee)} was promised: "${shownQuote(row)}"`);

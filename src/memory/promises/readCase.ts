import { parsePromiseLine } from "./contract";
import { applyPromiseLines, type PromiseCastMember, type PromiseWindowMessage } from "./impl";
import { createPromises, openPromiseRefs } from "./state";
import type { OpenPromiseRef, ParsedPromiseLine, PromisesState } from "./types";

export interface PromiseSeed {
  key: string;
  promisee: string;
  messageId: number;
  quote: string;
  deadline?: string;
}

export interface PromiseCaseContext {
  chatId: string;
  storyId?: string;
  messages: readonly PromiseWindowMessage[];
  cast: readonly PromiseCastMember[];
  playerNames: readonly string[];
  storyDay?: number | null;
}

export interface SeededPromises {
  state: PromisesState;
  ids: Record<string, string>;
  refused: Array<{ key: string; reason: string }>;
}

export interface PromiseReadLine {
  raw: string;
  kind: string | null;
  target: string | null;
  messageId: number | null;
  quote: string | null;
  outcome: "accepted" | "refused" | "unparsed";
  reason?: string;
}

export interface PromiseReadRow {
  id: string;
  key: string | null;
  promisee: string;
  messageId: number;
  isUser: boolean;
  quote: string;
  span: [number, number];
  conditional: boolean;
}

export interface PromiseReadEvent {
  rowId: string;
  key: string | null;
  kind: string;
  messageId: number;
  quote: string;
}

export interface PromiseReadOutcome {
  lines: PromiseReadLine[];
  rows: PromiseReadRow[];
  events: PromiseReadEvent[];
}

const seedLine = (seed: PromiseSeed, nameOf: (id: string) => string): ParsedPromiseLine => {
  const deadline = seed.deadline ? ` | by "${seed.deadline}"` : "";
  return {
    kind: "promised", target: nameOf(seed.promisee), messageId: seed.messageId, quote: seed.quote, ...(seed.deadline ? { deadline: seed.deadline } : {}),
    line: `[promised] ${nameOf(seed.promisee)} | m=${seed.messageId} | "${seed.quote}"${deadline}`,
  };
};

const nameFor = (cast: readonly PromiseCastMember[]) => (id: string): string => cast.find((member) => member.id === id)?.names[0] ?? id;

const windowFor = (ctx: PromiseCaseContext, from: number, to: number) =>
  ({ from, to, messages: ctx.messages.filter((message) => message.messageId >= from && message.messageId <= to) });

export function seedPromises(seeds: readonly PromiseSeed[], ctx: PromiseCaseContext): SeededPromises {
  if (!seeds.length) return { state: createPromises(), ids: {}, refused: [] };
  const nameOf = nameFor(ctx.cast);
  const to = Math.max(...ctx.messages.map((message) => message.messageId));
  const result = applyPromiseLines(createPromises(), seeds.map((seed) => seedLine(seed, nameOf)), {
    chatId: ctx.chatId, ...(ctx.storyId ? { storyId: ctx.storyId } : {}), window: windowFor(ctx, 0, to), cast: ctx.cast, boundary: 0,
    ...(ctx.storyDay !== undefined ? { storyDay: ctx.storyDay } : {}),
  }, ctx.playerNames);
  const ids: Record<string, string> = {};
  const refused: SeededPromises["refused"] = [];
  for (const seed of seeds) {
    const row = result.state.rows.find((entry) => entry.promisee === seed.promisee && entry.source.messageId === seed.messageId && entry.quote === seed.quote);
    if (row) ids[seed.key] = row.id;
    else refused.push({ key: seed.key, reason: result.refused.find((entry) => entry.line === seedLine(seed, nameOf).line)?.reason ?? "not seeded" });
  }
  return { state: result.state, ids, refused };
}

export const seededRefs = (seeded: SeededPromises, cast: readonly PromiseCastMember[]): OpenPromiseRef[] => openPromiseRefs(seeded.state, nameFor(cast));

export function applyReadLines(before: PromisesState, rawLines: readonly string[], ctx: PromiseCaseContext, window: { from: number; to: number },
  ids: Record<string, string> = {}): PromiseReadOutcome {
  const parsed = rawLines.map((raw) => ({ raw, parsed: parsePromiseLine(raw.trim()) }));
  const lines = parsed.flatMap((entry): ParsedPromiseLine[] => ("line" in entry.parsed ? [entry.parsed.line] : []));
  const result = applyPromiseLines(before, lines, {
    chatId: ctx.chatId, ...(ctx.storyId ? { storyId: ctx.storyId } : {}), window: windowFor(ctx, window.from, window.to), cast: ctx.cast, boundary: 1,
    ...(ctx.storyDay !== undefined ? { storyDay: ctx.storyDay } : {}),
  }, ctx.playerNames);
  const keyOf = (id: string) => Object.entries(ids).find(([, value]) => value === id)?.[0] ?? null;
  const known = new Set(before.rows.map((row) => row.id));
  const priorEvents = new Set(before.rows.flatMap((row) => row.events.map((event) => event.eventId)));
  const userAt = (messageId: number) => ctx.messages.find((message) => message.messageId === messageId)?.isUser === true;
  return {
    lines: parsed.map(({ raw, parsed: entry }): PromiseReadLine => {
      if ("reason" in entry) return { raw, kind: null, target: null, messageId: null, quote: null, outcome: "unparsed", reason: entry.reason };
      const refusal = result.refused.find((refused) => refused.line === entry.line.line);
      return {
        raw, kind: entry.line.kind, target: entry.line.target, messageId: entry.line.messageId, quote: entry.line.quote,
        outcome: refusal ? "refused" : "accepted", ...(refusal ? { reason: refusal.reason } : {}),
      };
    }),
    rows: result.state.rows.filter((row) => !known.has(row.id)).map((row) => ({
      id: row.id, key: keyOf(row.id), promisee: row.promisee, messageId: row.source.messageId, isUser: userAt(row.source.messageId), quote: row.quote,
      span: row.source.span, conditional: row.conditional === true,
    })),
    events: result.state.rows.flatMap((row) => row.events.filter((event) => !priorEvents.has(event.eventId)).map((event) => ({
      rowId: row.id, key: keyOf(row.id), kind: event.kind, messageId: event.source.messageId, quote: event.quote,
    }))),
  };
}

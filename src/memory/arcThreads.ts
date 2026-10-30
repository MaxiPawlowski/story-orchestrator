import { fnv1a } from "@utils/fnv";
import type { SourceSpan } from "./audience";
import { contentWords, sharedCount } from "./words";
import type { ArcEntry, ArcEvent, ParsedArcSignal } from "./types";

export const ARC_REOPEN_MIN_SHARED = 2;
export const ARC_REOPEN_COVERAGE = 0.3;
export const PUT_OFF_LABEL = " (put off)";

export interface ArcWindowMessage {
  messageId: number;
  text: string;
  speaker: string;
  isUser: boolean;
  swipeId?: number;
}

export interface ArcRead {
  chatId: string;
  storyId?: string;
  window: { from: number; to: number; messages: readonly ArcWindowMessage[] };
}

export interface ArcRefusal {
  line: string;
  reason: string;
}

export type ArcThreadState = "open" | "deferred" | "resolved";

const historyOf = (arc: ArcEntry): ArcEvent[] => (Array.isArray(arc.history) ? arc.history : []);

export const lastArcEvent = (arc: ArcEntry): ArcEvent | undefined => historyOf(arc).at(-1);

export const arcDeferred = (arc: ArcEntry): boolean => arc.status === "open" && lastArcEvent(arc)?.kind === "deferred";

export const arcThreadState = (arc: ArcEntry): ArcThreadState => (arc.status === "resolved" ? "resolved" : arcDeferred(arc) ? "deferred" : "open");

export const deferredSignalLine = (signal: ParsedArcSignal): string =>
  `[deferred] ${signal.text}${typeof signal.messageId === "number" ? ` | m=${signal.messageId}` : ""}${signal.quote ? ` | "${signal.quote}"` : ""}`;

const spanOf = (read: ArcRead, message: ArcWindowMessage, from: number, to: number): SourceSpan => ({
  chatId: read.chatId, ...(read.storyId ? { storyId: read.storyId } : {}), messageId: message.messageId,
  revision: { swipeId: message.swipeId ?? null, hash: fnv1a(message.text) }, speaker: message.speaker, isUser: message.isUser,
  span: [from, to], inputRange: { from: read.window.from, to: read.window.to },
});

export function deferralSpan(signal: ParsedArcSignal, read: ArcRead): { source: SourceSpan } | { reason: string } {
  if (typeof signal.messageId !== "number" || !signal.quote) return { reason: "no player span" };
  const message = read.window.messages.find((entry) => entry.messageId === signal.messageId);
  if (!message) return { reason: "message is not in the read's window" };
  if (!message.isUser) return { reason: "not the player's own words" };
  const quote = [signal.quote, signal.quote.replace(/\\"/g, "\"")].find((form) => message.text.includes(form));
  if (!quote) return { reason: "quote is not word for word in that message" };
  const from = message.text.indexOf(quote);
  return { source: spanOf(read, message, from, from + quote.length) };
}

export const touchesArc = (arc: ArcEntry, text: string): boolean => {
  const words = contentWords(arc.text);
  const shared = sharedCount(words, contentWords(text));
  return words.size > 0 && shared >= ARC_REOPEN_MIN_SHARED && shared / words.size >= ARC_REOPEN_COVERAGE;
};

export const withArcEvent = (arc: ArcEntry, event: ArcEvent): ArcEntry => ({ ...arc, history: [...historyOf(arc), event] });

export function deferArc(arc: ArcEntry, source: SourceSpan, quote: string, at: { boundary: number; messageId: number }): ArcEntry | { reason: string } {
  if (arcDeferred(arc)) return { reason: "already put off" };
  const last = lastArcEvent(arc);
  if (last && last.span.messageId >= source.messageId) return { reason: "older than the thread's last change" };
  return withArcEvent(arc, { kind: "deferred", boundary: at.boundary, messageId: at.messageId, span: source, quote });
}

export function reopenTouched(arc: ArcEntry, read: ArcRead, at: { boundary: number; messageId: number }): ArcEntry | null {
  const last = lastArcEvent(arc);
  if (!last || !arcDeferred(arc)) return null;
  const message = read.window.messages.find((entry) => entry.isUser && entry.messageId > last.span.messageId && touchesArc(arc, entry.text));
  if (!message) return null;
  return withArcEvent(arc, { kind: "reopened", boundary: at.boundary, messageId: at.messageId, span: spanOf(read, message, 0, message.text.length), quote: message.text });
}

export function rollbackArcHistory(arc: ArcEntry, messageId: number, boundary: number): ArcEntry {
  const history = historyOf(arc);
  const kept = history.filter((event) => event.messageId < messageId && event.boundary <= boundary);
  if (kept.length === history.length) return arc;
  const { history: _history, ...rest } = arc;
  return kept.length ? { ...rest, history: kept } : rest;
}

export const injectedThreads = (arcs: readonly ArcEntry[], settings: { deferredOutOfPrompt?: boolean }): ArcEntry[] =>
  arcs.filter((arc) => arc.status === "open" && !(settings.deferredOutOfPrompt === true && arcDeferred(arc)));

const QUOTE_SHOWN = 80;

export const arcHistoryLines = (arc: ArcEntry): string[] => historyOf(arc).map((event) => {
  const quote = event.quote.length > QUOTE_SHOWN ? `${event.quote.slice(0, QUOTE_SHOWN - 1)}…` : event.quote;
  return `${event.kind === "deferred" ? "Put off" : "Picked up again"} at boundary ${event.boundary} (message ${event.span.messageId}): "${quote}"`;
});

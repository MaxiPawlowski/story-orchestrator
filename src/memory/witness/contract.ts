import { fnv1a } from "@runtime/hash";
import type { SourceRevision } from "../audience";
import type { HeardList, WitnessAudit, WitnessClaim, WitnessInputRange, WitnessReadStatus, WitnessSpanClaim } from "./types";

export function renderWitnessContractSection(): string {
  return [
    "Who heard each transcript line: write one witness line per message naming the cast members (roster ids) who heard or saw it first-hand. "
      + "Speech said aloud reaches everyone in earshot; a whisper, aside or private thought reaches only those it reaches.",
    "WITNESS m=<message index> heard=<roster id,roster id|all-present|unknown>",
    "When parts of one message reach different listeners, write WITNESS m=<message index> mixed, then one line per part:",
    "SPAN m=<message index> from=\"<the part's first 4 to 8 words, copied exactly>\" heard=<roster id,...|unknown>",
    "Write unknown when the transcript does not show who heard it.",
  ].join("\n");
}

export interface WitnessWindowMessage {
  messageId: number;
  text: string;
  swipeId?: number;
}

export interface WitnessResolveContext {
  from: number;
  to: number;
  messages: readonly WitnessWindowMessage[];
  present: readonly string[];
  resolveMember: (token: string) => string | null;
}

export interface WitnessRejection {
  line: string;
  reason: string;
}

const WITNESS = /^WITNESS\s+m\s*=\s*(\d+)\s+(?:heard\s*=\s*(.*?)|(mixed))\s*$/i;
const SPAN = /^SPAN\s+m\s*=\s*(\d+)\s+from\s*=\s*["“](.+?)["”]\s+heard\s*=\s*(.*?)\s*$/i;
const NOBODY = /^(?:none|nobody|no one|-)$/i;

export const isWitnessLine = (line: string): boolean => /^(?:WITNESS|SPAN)\s/i.test(line);

export const revisionOf = (message: WitnessWindowMessage): SourceRevision => ({ swipeId: message.swipeId ?? null, hash: fnv1a(message.text) });

const parseHeard = (raw: string, ctx: WitnessResolveContext): { heard: HeardList; unknownMember?: string } => {
  const value = raw.trim();
  if (/^all-present$/i.test(value)) return { heard: { kind: "all-present", members: [...ctx.present] } };
  if (!value || /^unknown$/i.test(value)) return { heard: { kind: "unknown" } };
  if (NOBODY.test(value)) return { heard: { kind: "members", members: [] } };
  const members: string[] = [];
  for (const token of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const id = ctx.resolveMember(token);
    if (!id) return { heard: { kind: "unknown" }, unknownMember: token };
    if (!members.includes(id)) members.push(id);
  }
  return { heard: { kind: "members", members } };
};

interface Pending {
  heard: Array<{ heard: HeardList; line: string }>;
  mixed: boolean;
  spans: Array<{ anchor: string; heard: HeardList; line: string }>;
}

const sameHeard = (left: HeardList, right: HeardList): boolean =>
  left.kind === right.kind && (left.kind === "unknown" || JSON.stringify([...(left as { members: string[] }).members].sort()) === JSON.stringify([...(right as { members: string[] }).members].sort()));

const occurrences = (text: string, needle: string): number[] => {
  const found: number[] = [];
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) found.push(at);
  return found;
};

const resolveSpans = (text: string, spans: Pending["spans"], rejected: WitnessRejection[]): WitnessSpanClaim[] | null => {
  const anchored: Array<{ at: number; heard: HeardList }> = [];
  for (const span of spans) {
    const at = occurrences(text, span.anchor);
    if (at.length !== 1) {
      rejected.push({ line: span.line, reason: at.length ? "span anchor matches more than once" : "span anchor not in the message" });
      return null;
    }
    if (anchored.some((entry) => entry.at === at[0])) {
      rejected.push({ line: span.line, reason: "overlapping span anchors" });
      return null;
    }
    anchored.push({ at: at[0], heard: span.heard });
  }
  anchored.sort((left, right) => left.at - right.at);
  return anchored.map((entry, index) => ({ span: [entry.at, anchored[index + 1]?.at ?? text.length], heard: entry.heard }));
};

export function resolveWitnessLines(lines: readonly string[], ctx: WitnessResolveContext): { claims: WitnessClaim[]; rejected: WitnessRejection[] } {
  const rejected: WitnessRejection[] = [];
  const byMessage = new Map<number, Pending>();
  const byId = new Map(ctx.messages.map((message) => [message.messageId, message]));
  const pending = (id: number): Pending => byMessage.get(id) ?? byMessage.set(id, { heard: [], mixed: false, spans: [] }).get(id) as Pending;
  for (const line of lines) {
    const witness = line.match(WITNESS);
    const span = witness ? null : line.match(SPAN);
    const match = witness ?? span;
    if (!match) {
      rejected.push({ line, reason: "invalid witness line" });
      continue;
    }
    const id = Number(match[1]);
    if (!byId.has(id)) {
      rejected.push({ line, reason: "message not in the read's window" });
      continue;
    }
    if (witness?.[3]) {
      pending(id).mixed = true;
      continue;
    }
    const parsed = parseHeard(witness ? witness[2] : (span as RegExpMatchArray)[3], ctx);
    if (parsed.unknownMember) rejected.push({ line, reason: `unknown member "${parsed.unknownMember}"` });
    if (witness) pending(id).heard.push({ heard: parsed.heard, line });
    else pending(id).spans.push({ anchor: (span as RegExpMatchArray)[2], heard: parsed.heard, line });
  }
  const claims: WitnessClaim[] = [];
  for (const [messageId, entry] of [...byMessage.entries()].sort((left, right) => left[0] - right[0])) {
    const message = byId.get(messageId) as WitnessWindowMessage;
    const revision = revisionOf(message);
    if (entry.mixed || entry.spans.length) {
      entry.heard.forEach((heard) => rejected.push({ line: heard.line, reason: "a mixed message takes span lines, not a whole-message witness line" }));
      const spans = resolveSpans(message.text, entry.spans, rejected);
      claims.push({ messageId, revision, mixed: true, heard: { kind: "unknown" }, spans: spans ?? [] });
      continue;
    }
    const [first, ...rest] = entry.heard;
    const conflict = rest.some((other) => !sameHeard(first.heard, other.heard));
    if (conflict) rest.forEach((other) => rejected.push({ line: other.line, reason: "conflicting witness lines for one message" }));
    claims.push({ messageId, revision, mixed: false, heard: conflict ? { kind: "unknown" } : first.heard, spans: [] });
  }
  return { claims, rejected };
}

export const witnessInputRange = (ctx: Pick<WitnessResolveContext, "from" | "to" | "messages">): WitnessInputRange => ({
  from: ctx.from, to: ctx.to, revisions: ctx.messages.map((message) => ({ messageId: message.messageId, revision: revisionOf(message) })),
});

export function witnessAudit(status: WitnessReadStatus, lines: readonly string[], ctx: WitnessResolveContext): { audit: WitnessAudit; rejected: WitnessRejection[] } {
  const resolved = status === "accepted" ? resolveWitnessLines(lines, ctx) : { claims: [], rejected: [] };
  return { audit: { status, inputRange: witnessInputRange(ctx), claims: resolved.claims }, rejected: resolved.rejected };
}

import { fnv1a } from "@runtime/hash";
import { commitmentVerdict } from "@extraction/commitGuard";
import { contentWords, restatesWords, sharedCount } from "../words";
import type { SourceSpan } from "../audience";
import { evictPromises, promiseStatus, shownQuote } from "./state";
import {
  PROMISE_COOLDOWN_TURNS, PROMISE_OPEN_CAP, PROMISE_TRIGGER_SURFACINGS,
  type ParsedPromiseLine, type PromiseDeadline, type PromiseEvent, type PromiseRow, type PromisesState, type QuestStatusOf,
} from "./types";

export interface PromiseWindowMessage {
  messageId: number;
  text: string;
  speaker: string;
  isUser: boolean;
  swipeId?: number;
}

export interface PromiseCastMember {
  id: string;
  names: string[];
}

export interface PromiseQuest {
  id: string;
  title: string;
  giver?: string;
  promise?: boolean;
  steps?: Array<{ text?: string }>;
}

export interface PromiseApplyContext {
  chatId: string;
  storyId?: string;
  window: { from: number; to: number; messages: readonly PromiseWindowMessage[] };
  cast: readonly PromiseCastMember[];
  quests?: readonly PromiseQuest[];
  storyDay?: number | null;
  boundary: number;
  horizonMessageId?: number | null;
}

export interface PromiseApplyResult {
  state: PromisesState;
  accepted: string[];
  refused: Array<{ line: string; reason: string }>;
  capped: number;
}

export const PROMISE_MATCHER = /\b(?:promise|promised|swear|vow|you have my word|i give you my word|on my word|i will|i'll|i shall)\b/i;
const STRONG = /\b(?:promise|promised|swear|vow|word)\b/i;
const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b/i;
const CONDITIONAL = /\b(?:if|unless|provided|as long as|only when|once you|so long as)\b/i;
const GROUP = /\b(?:everyone|everybody|all of you|you all|y'all|both of you|you two|you lot|you guys|the lot of you)\b/i;
const SARCASM = /(?:\/s\b|\byeah,? right\b|\bas if\b|\bsarcastic(?:ally)?\b|\brolls? (?:my|his|her|their) eyes\b|\beye-?roll|\bsure,? sure\b|\(not\))/i;
const REPORT_VERB = "(?:said|says|told|tells|promised|promises|swore|swears|vowed|vows|asked|asks|wrote|writes|claimed|claims)";
const QUOTE_MARKS = /["“”]/g;
const REFUSAL = /\b(?:not|never|no|won't|wont|can't|cant|cannot|refuse|refused|break|broke|sorry|failed|fail)\b|n't\b/i;
const SENTENCE_BREAK = /[.!?\n]/;
const ASKS = /\b(?:promis(?:e|ed|es)|my word|swore|vow(?:ed)?)\b/i;
const MENTION = /\b(?:promise|promised|your word|you swore|you vowed)\b/i;
const FILLER = new Set(["promise", "promised", "swear", "vow", "word", "i'll", "i'm", "you", "your", "back", "get", "make", "take", "give", "bring", "keep", "i", "me", "my"]);

const DAY_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, fortnight: 14 };

export const resolveDueDay = (text: string, today: number): number | undefined => {
  const lower = text.toLowerCase();
  if (/\b(?:tonight|today|nightfall|sundown|sunset|dusk|this evening)\b/.test(lower)) return today;
  if (/\b(?:tomorrow|dawn|daybreak|first light|morning)\b/.test(lower)) return today + 1;
  if (/\bfortnight\b/.test(lower)) return today + 14;
  if (/\b(?:a|one) week\b|\bweek'?s end\b/.test(lower)) return today + 7;
  const days = lower.match(/\b(?:in|within)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a)\s+days?\b/);
  if (days) return today + (Number.isFinite(Number(days[1])) ? Number(days[1]) : DAY_WORDS[days[1]]);
  return undefined;
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const named = (text: string, names: readonly string[]): boolean =>
  names.some((name) => name.trim().length > 1 && new RegExp(`(?<![\\w])${escapeRegExp(name.trim())}(?![\\w])`, "i").test(text));
const sameName = (speaker: string, names: readonly string[]): boolean => names.some((name) => name.trim().toLowerCase() === speaker.trim().toLowerCase());

const memberFor = (cast: readonly PromiseCastMember[], target: string): PromiseCastMember | undefined => {
  const wanted = target.trim().toLowerCase();
  return cast.find((member) => member.id.toLowerCase() === wanted) ?? cast.find((member) => member.names.some((name) => name.trim().toLowerCase() === wanted));
};

const sentenceAround = (text: string, from: number, to: number): { start: number; end: number; text: string } => {
  let start = from;
  while (start > 0 && !SENTENCE_BREAK.test(text[start - 1])) start -= 1;
  let end = to;
  while (end < text.length && !SENTENCE_BREAK.test(text[end])) end += 1;
  return { start, end, text: text.slice(start, end) };
};

const quotedSegment = (text: string, at: number): { open: number; close: number } | null => {
  const marks = [...text.matchAll(QUOTE_MARKS)].map((mark) => mark.index ?? 0);
  for (let index = 0; index + 1 < marks.length; index += 2) if (marks[index] < at && at < marks[index + 1]) return { open: marks[index], close: marks[index + 1] };
  return null;
};

export const quotesSomeoneElse = (text: string, from: number, playerNames: readonly string[]): boolean => {
  const segment = quotedSegment(text, from);
  if (!segment) return false;
  const lead = text.slice(Math.max(0, segment.open - 60), segment.open);
  const tail = text.slice(segment.close + 1, segment.close + 40);
  const self = new RegExp(`^(?:i|me|${playerNames.map((name) => escapeRegExp(name.trim())).filter(Boolean).join("|") || "\\u0000"})$`, "i");
  const reporter = (who: string | undefined) => Boolean(who) && !self.test(String(who).trim());
  const before = lead.match(new RegExp(`(\\b[A-Z][a-z]+|\\b(?:he|she|they|you))\\s+(?:\\w+\\s+)?${REPORT_VERB}\\b[^"“”]*$`, "i"));
  const after = tail.match(new RegExp(`^[\\s,]*(?:${REPORT_VERB}\\s+(\\b[A-Z][a-z]+|he|she|they|you)\\b|(\\b[A-Z][a-z]+|he|she|they|you)\\s+${REPORT_VERB}\\b)`, "i"));
  return reporter(before?.[1]) || reporter(after?.[1] ?? after?.[2]);
};

const revisionOf = (message: PromiseWindowMessage) => ({ swipeId: message.swipeId ?? null, hash: fnv1a(message.text) });

const spanOf = (ctx: PromiseApplyContext, message: PromiseWindowMessage, from: number, to: number): SourceSpan => ({
  chatId: ctx.chatId, ...(ctx.storyId ? { storyId: ctx.storyId } : {}), messageId: message.messageId, revision: revisionOf(message),
  speaker: message.speaker, isUser: message.isUser, span: [from, to], inputRange: { from: ctx.window.from, to: ctx.window.to },
});

const locate = (message: PromiseWindowMessage, quote: string): { from: number; quote: string } | null => {
  for (const form of [quote, quote.replace(/\\"/g, "\"")]) {
    const from = message.text.indexOf(form);
    if (from >= 0) return { from, quote: form };
  }
  return null;
};

const answeredSpeaker = (messages: readonly PromiseWindowMessage[], messageId: number): PromiseWindowMessage | undefined =>
  [...messages].reverse().find((message) => message.messageId < messageId && !message.isUser);

const subjectWords = (quote: string): Set<string> => new Set([...contentWords(quote)].filter((word) => !FILLER.has(word)));

const questLink = (quote: string, promisee: string, quests: readonly PromiseQuest[]): PromiseQuest | undefined => {
  const words = contentWords(quote);
  let best: { quest: PromiseQuest; shared: number } | null = null;
  for (const quest of quests) {
    if (!quest.promise || quest.giver !== promisee) continue;
    const title = contentWords([quest.title, ...(quest.steps ?? []).map((step) => step.text ?? "")].join(" "));
    const shared = sharedCount(words, title);
    if (shared >= Math.min(2, Math.max(1, title.size)) && (!best || shared > best.shared)) best = { quest, shared };
  }
  return best?.quest;
};

type Outcome<T> = { ok: T } | { reason: string };

const acceptPromise = (state: PromisesState, line: ParsedPromiseLine, ctx: PromiseApplyContext, playerNames: readonly string[]): Outcome<PromiseRow> => {
  const message = ctx.window.messages.find((entry) => entry.messageId === line.messageId);
  if (!message) return { reason: "message is not in the read's window" };
  const found = locate(message, line.quote);
  if (!found) return { reason: "quote is not word for word in that message" };
  const { from, quote } = found;
  const to = from + quote.length;
  if (!message.isUser) return { reason: "not the player's own words" };
  if (quotesSomeoneElse(message.text, from, playerNames)) return { reason: "the player is quoting someone else" };
  const sentence = sentenceAround(message.text, from, to);
  if (SARCASM.test(sentence.text) || SARCASM.test(message.text.slice(to, to + 40))) return { reason: "sarcasm marker" };
  const verdict = commitmentVerdict(message.text, PROMISE_MATCHER, [from, to]);
  if (!verdict.commits) return { reason: `no commitment (${verdict.reason})` };
  const member = memberFor(ctx.cast, line.target);
  if (!member) return { reason: "promisee is not in the cast" };
  if (GROUP.test(sentence.text)) return { reason: "a promise to an unnamed group" };
  const namedMembers = ctx.cast.filter((entry) => named(sentence.text, entry.names));
  const answered = answeredSpeaker(ctx.window.messages, message.messageId);
  if (namedMembers.length ? !namedMembers.includes(member) : !(answered && sameName(answered.speaker, member.names))) return { reason: "the promise is not addressed to that cast member" };
  if (!STRONG.test(verdict.matched) && !SECOND_PERSON.test(sentence.text) && !namedMembers.length) return { reason: "casual future tense without a commitment word or addressee" };
  const conditional = CONDITIONAL.test(sentence.text.slice(0, Math.max(0, verdict.index - sentence.start)));
  const source = spanOf(ctx, message, from, to);
  const id = `p${fnv1a([ctx.chatId, ctx.storyId ?? "", message.messageId, source.revision.hash, from, to, member.id].join("|"))}`;
  if (state.rows.some((row) => row.id === id)) return { reason: "duplicate" };
  const twin = state.rows.find((row) => row.promisee === member.id && promiseStatus(row) === "open" && shownQuote(row) === quote);
  if (twin) return { reason: `the same promise is already open (${twin.id})` };
  const deadline = deadlineFor(line, message, answered, member, ctx);
  const quests = ctx.quests ?? [];
  const quest = questLink(quote, member.id, quests);
  if (quest && state.rows.some((row) => row.questId === quest.id)) return { reason: `the quest "${quest.title}" already tracks this promise` };
  return { ok: {
    id, promisee: member.id, quote, source, madeAt: { boundary: ctx.boundary }, events: [],
    ...(deadline ? { deadline } : {}), ...(conditional ? { conditional: true as const } : {}), ...(quest ? { questId: quest.id } : {}),
  } };
};

const deadlineFor = (line: ParsedPromiseLine, message: PromiseWindowMessage, answered: PromiseWindowMessage | undefined, member: PromiseCastMember,
  ctx: PromiseApplyContext): PromiseDeadline | null => {
  if (!line.deadline) return null;
  const holder = [message, ...(answered && sameName(answered.speaker, member.names) ? [answered] : [])].find((entry) => entry.text.includes(line.deadline as string));
  if (!holder) return null;
  const at = holder.text.indexOf(line.deadline);
  const dueDay = typeof ctx.storyDay === "number" ? resolveDueDay(line.deadline, ctx.storyDay) : undefined;
  return { text: line.deadline, source: spanOf(ctx, holder, at, at + line.deadline.length), ...(dueDay !== undefined ? { dueDay } : {}) };
};

const acceptEvent = (state: PromisesState, line: ParsedPromiseLine, ctx: PromiseApplyContext, questStatus?: QuestStatusOf): Outcome<{ row: PromiseRow; event: PromiseEvent }> => {
  const row = state.rows.find((entry) => entry.id === line.target);
  if (!row) return { reason: "unknown promise id" };
  if (row.questId) return { reason: "linked to a quest; its state comes from the quest" };
  if (promiseStatus(row, questStatus) !== "open") return { reason: "promise already closed" };
  const message = ctx.window.messages.find((entry) => entry.messageId === line.messageId);
  if (!message) return { reason: "message is not in the read's window" };
  const found = locate(message, line.quote);
  if (!found) return { reason: "quote is not word for word in that message" };
  const { from, quote } = found;
  if (message.messageId <= row.source.messageId) return { reason: "evidence does not come after the promise" };
  const member = ctx.cast.find((entry) => entry.id === row.promisee);
  const byPromisee = Boolean(member && !message.isUser && sameName(message.speaker, member.names));
  const sentence = sentenceAround(message.text, from, from + quote.length).text;
  const overdue = typeof row.deadline?.dueDay === "number" && typeof ctx.storyDay === "number" && ctx.storyDay > row.deadline.dueDay;
  const answeredBack = (other: (entry: PromiseWindowMessage) => boolean) => ctx.window.messages.some((entry) => entry.messageId > row.source.messageId && other(entry));
  const allowed = line.kind === "kept" ? message.isUser || byPromisee
    : line.kind === "broken" ? (message.isUser && REFUSAL.test(sentence)) || (byPromisee && overdue)
    : line.kind === "released" ? byPromisee
    : (message.isUser && answeredBack((entry) => !entry.isUser && Boolean(member) && sameName(entry.speaker, member?.names ?? [])))
      || (byPromisee && answeredBack((entry) => entry.isUser));
  if (!allowed) return { reason: `${line.kind} needs ${EVENT_EVIDENCE[line.kind as PromiseEvent["kind"]]}` };
  const source = spanOf(ctx, message, from, from + quote.length);
  const eventId = fnv1a([row.id, line.kind, message.messageId, source.revision.hash, from, from + quote.length].join("|"));
  if (row.events.some((event) => event.eventId === eventId)) return { reason: "duplicate" };
  return { ok: { row, event: { eventId, kind: line.kind as PromiseEvent["kind"], quote, source, at: { boundary: ctx.boundary } } } };
};

const EVENT_EVIDENCE: Record<PromiseEvent["kind"], string> = {
  kept: "the player's action or the promisee's acknowledgement",
  broken: "the player's own refusal or the promisee naming an agreed deadline that passed",
  released: "the promisee's own words",
  renegotiated: "both the player and the promisee in the window",
};

export function applyPromiseLines(state: PromisesState, lines: readonly ParsedPromiseLine[], ctx: PromiseApplyContext, playerNames: readonly string[] = [],
  questStatus?: QuestStatusOf): PromiseApplyResult {
  let rows = [...state.rows];
  const accepted: string[] = [];
  const refused: PromiseApplyResult["refused"] = [];
  let capped = 0;
  for (const line of lines.filter((entry) => entry.kind === "promised")) {
    const outcome = acceptPromise({ rows }, line, ctx, playerNames);
    if ("reason" in outcome) { if (outcome.reason !== "duplicate") refused.push({ line: line.line, reason: outcome.reason }); continue; }
    if (rows.filter((row) => promiseStatus(row, questStatus) === "open").length >= PROMISE_OPEN_CAP) {
      capped += 1;
      refused.push({ line: line.line, reason: `open promise cap (${PROMISE_OPEN_CAP})` });
      continue;
    }
    rows = [...rows, outcome.ok];
    accepted.push(outcome.ok.id);
  }
  for (const line of lines.filter((entry) => entry.kind !== "promised")) {
    const outcome = acceptEvent({ rows }, line, ctx, questStatus);
    if ("reason" in outcome) { if (outcome.reason !== "duplicate") refused.push({ line: line.line, reason: outcome.reason }); continue; }
    rows = rows.map((row) => (row.id === outcome.ok.row.id ? { ...row, events: [...row.events, outcome.ok.event] } : row));
    accepted.push(outcome.ok.event.eventId);
  }
  return { state: evictPromises({ rows }, ctx.horizonMessageId ?? null), accepted, refused, capped };
}

export const restatesPromise = (text: string, state: PromisesState | undefined): boolean => {
  const words = contentWords(text);
  return (state?.rows ?? []).some((row) => promiseStatus(row) === "open" && restatesWords(subjectWords(shownQuote(row)), words));
};

export interface ReminderRow {
  index: number;
  speaker: string;
  isUser: boolean;
  text: string;
}

export interface ReminderContext {
  rosterId: string;
  promiseeNames: readonly string[];
  playerName: string;
  chat: readonly ReminderRow[];
  questStatus?: QuestStatusOf;
  storyDay?: number | null;
  location?: string;
}

const touches = (subject: ReadonlySet<string>, text: string): boolean => {
  const shared = sharedCount(subject, contentWords(text));
  return subject.size > 0 && shared >= Math.min(2, subject.size);
};

const reminderFor = (row: PromiseRow, ctx: ReminderContext): string => {
  const quote = shownQuote(row);
  const subject = subjectWords(quote);
  const after = ctx.chat.filter((entry) => entry.index > row.source.messageId);
  const promiseeTurns = after.filter((entry) => !entry.isUser && sameName(entry.speaker, ctx.promiseeNames));
  const mention = [...promiseeTurns].reverse().find((entry) => MENTION.test(entry.text) || touches(subject, entry.text));
  const newest = ctx.chat[ctx.chat.length - 1];
  const lastPlayer = newest?.isUser ? newest : undefined;
  const asks = Boolean(lastPlayer && ASKS.test(lastPlayer.text));
  const transient = asks || Boolean(newest && newest.index > row.source.messageId && touches(subject, newest.text));
  const due = typeof row.deadline?.dueDay === "number" && typeof ctx.storyDay === "number" && ctx.storyDay >= row.deadline.dueDay;
  const placed = Boolean(ctx.location && sharedCount(contentWords(ctx.location), subject) > 0);
  const sinceMention = mention ? promiseeTurns.filter((entry) => entry.index > mention.index).length : null;
  const cooling = sinceMention !== null && sinceMention < PROMISE_COOLDOWN_TURNS;
  const since = sinceMention ?? promiseeTurns.length;
  const persistentOpen = since >= PROMISE_COOLDOWN_TURNS && since % PROMISE_COOLDOWN_TURNS < PROMISE_TRIGGER_SURFACINGS;
  if (!(asks || (!cooling && (transient || ((due || placed) && persistentOpen))))) return "";
  const passed = typeof row.deadline?.dueDay === "number" && typeof ctx.storyDay === "number" && ctx.storyDay > row.deadline.dueDay;
  const deadline = row.deadline ? ` (by "${row.deadline.text}"${passed ? ", and that day has passed" : ""})` : "";
  return `${ctx.playerName} promised you: "${quote}"${deadline}. You may bring it up if it fits.`;
};

const keptLine = (row: PromiseRow, ctx: ReminderContext): string => {
  const last = row.events[row.events.length - 1];
  if (row.questId || !last || last.kind !== "kept") return "";
  const spoken = ctx.chat.some((entry) => entry.index > last.source.messageId && !entry.isUser && sameName(entry.speaker, ctx.promiseeNames));
  return spoken ? "" : `${ctx.playerName} kept their word to you: "${shownQuote(row)}".`;
};

export function promiseReminderLines(state: PromisesState | undefined, ctx: ReminderContext): string[] {
  return (state?.rows ?? []).filter((row) => row.promisee === ctx.rosterId).flatMap((row) => {
    const status = promiseStatus(row, ctx.questStatus);
    if (status === "kept") return [keptLine(row, ctx)].filter(Boolean);
    if (status !== "open" || row.conditional) return [];
    return [reminderFor(row, ctx)].filter(Boolean);
  });
}


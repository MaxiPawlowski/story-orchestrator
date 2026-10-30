import { PROMISE_EVENT_KINDS, type OpenPromiseRef, type ParsedPromiseLine, type PromiseEventKind } from "./types";

export const PROMISE_ADDRESSEE_LINE = "A promise said to \"you\" right after a cast member spoke is for that cast member: write their name.";

export interface PromiseSectionOptions {
  addressee?: boolean;
}

export function renderPromiseRules(options: PromiseSectionOptions = {}): string {
  return [
    "Promises the player makes: write a promise line only when a line the player wrote commits them to something for one named cast member, "
      + "or for the character the player is answering:",
    "[promised] <cast name> | m=<message index> | \"<the player's exact words, copied character for character>\" | by \"<exact deadline words>\"",
    "Leave out \"| by ...\" unless a deadline was agreed in words. Never invent a deadline or paraphrase. Never write a hedge, refusal, question, sarcasm, "
      + "a casual plan (\"I'll check the stables\"), words the player quotes from someone else, a promise a cast member made, or a promise to a group.",
    ...(options.addressee ? [PROMISE_ADDRESSEE_LINE] : []),
  ].join("\n");
}

export function renderOpenPromises(open: readonly OpenPromiseRef[] = []): string {
  return open.length
    ? [
      "OPEN PROMISES (refer to them by id only):",
      ...open.map((ref) => `${ref.id} ${ref.promisee}: "${ref.quote}"`),
      "When the window shows one of them kept, broken, changed or let go, write one line with the evidence words copied exactly:",
      ...PROMISE_EVENT_KINDS.map((kind) => `[${kind}] <id> | m=<message index> | "<exact words>"`),
      "Only the promisee releases a promise; broken needs the player's own refusal or the promisee saying an agreed deadline passed.",
    ].join("\n")
    : "";
}

export function renderPromiseContractSection(open: readonly OpenPromiseRef[] = [], options: PromiseSectionOptions = {}): string {
  return [renderPromiseRules(options), renderOpenPromises(open)].filter(Boolean).join("\n");
}

const QUOTE_OPEN = "[\"“]";
const QUOTE_CLOSE = "[\"”]";
const BY = `(?:\\|\\s*(?:by\\s*${QUOTE_OPEN}(.+?)${QUOTE_CLOSE}|by\\s+none|none)\\s*)?`;
const PROMISED = new RegExp(`^\\[promised\\]\\s*([^|]+?)\\s*\\|\\s*(?:m\\s*=\\s*)?(\\d+)\\s*\\|\\s*${QUOTE_OPEN}(.+?)${QUOTE_CLOSE}\\s*${BY}$`, "i");
const EVENT = new RegExp(`^\\[(${PROMISE_EVENT_KINDS.join("|")})\\]\\s*([a-z0-9]+)\\s*\\|\\s*(?:m\\s*=\\s*)?(\\d+)\\s*\\|\\s*${QUOTE_OPEN}(.+?)${QUOTE_CLOSE}\\s*$`, "i");
const NO_MESSAGE = /^\[(promised|kept|broken|renegotiated|released)\]\s*[^|]+\|\s*[“"]/i;

export type PromiseLineParse = { line: ParsedPromiseLine } | { reason: string };

export function parsePromiseLine(line: string): PromiseLineParse {
  const promised = line.match(PROMISED);
  if (promised) {
    const quote = promised[3].trim();
    if (!quote) return { reason: "empty promise quote" };
    const deadline = promised[4]?.trim();
    return { line: { kind: "promised", target: promised[1].trim(), messageId: Number(promised[2]), quote, ...(deadline ? { deadline } : {}), line } };
  }
  const event = line.match(EVENT);
  if (event) {
    const quote = event[4].trim();
    if (!quote) return { reason: "empty promise evidence" };
    return { line: { kind: event[1].toLowerCase() as PromiseEventKind, target: event[2].trim(), messageId: Number(event[3]), quote, line } };
  }
  return { reason: NO_MESSAGE.test(line) ? "promise line without m=<message index>" : "invalid promise line" };
}

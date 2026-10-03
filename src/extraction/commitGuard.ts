import { gateLeaves, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { log } from "@utils/log";
import type { EvidenceMessage } from "./evidence";
import type { ParsedDelta } from "./types";

// A quality whose value only means something when the player COMMITTED to it can declare a
// `commit_evidence` pattern. A delta for it is accepted only when a line the player wrote, inside the
// window the read was given, commits to it: the pattern matches outside a question, no negator, hedge
// or "rather than" stands before the verb in the same clause ("we won't take it", "maybe we'll take
// it"), and the sentence is about the claimed value. About means the value's own words in a clause
// that does not deny them, or, when the sentence names no other option ("the merchant job instead"),
// the intent of a transition the value opens; while the window carries the offer, also a deal term
// before the verb ("triple the fee, and we ride") or a gate partner's value in the verb's clause
// ("we ride as the Ash Lanterns"). A verb that points back ("we'll do it", "count us in", "sign us
// up", a bare "Deal.") needs the window to be about the value. Which line the read quoted does not
// decide it, and an NPC or narrator line saying the player agreed never stands in for the player's
// own words. Values with no pattern keep today's behaviour.
export type CommitStory = Pick<NormalizedStoryV2, "qualityByKey" | "transitions">;

export interface HeldCommitDelta {
  key: string;
  value: string;
  evidence: string;
  reason?: string;
  playerLine?: string;
}

export interface CommitGuardResult {
  accepted: ParsedDelta[];
  held: HeldCommitDelta[];
}

const compiled = new Map<string, RegExp | null>();

const compile = (pattern: string | undefined, flags: string): RegExp | null => {
  if (!pattern) return null;
  const key = `${flags}:${pattern}`;
  if (compiled.has(key)) return compiled.get(key) ?? null;
  let matcher: RegExp | null = null;
  try {
    matcher = new RegExp(pattern, flags);
  } catch (error) {
    log.warn(`commit pattern ${pattern} is not a valid regular expression; it is ignored`, error);
    matcher = null;
  }
  compiled.set(key, matcher);
  return matcher;
};

const NEGATOR = /\b(?:not|never|no|nor|neither|cannot|wont|dont|cant|refuse[sd]?|refusing|decline[sd]?|declining)\b|n't\b/i;
const HEDGE = /\b(?:maybe|perhaps|might|may|could|should|would|whether|if|unless|considering|thinking)\b|\bthan\s*$/i;
const CLAUSE_BREAK = /[.!?\n,;:()—–]|\bbut\b|\bthough\b|\balthough\b/i;
const SENTENCE_BREAK = /[.!?\n]/;
const POINTS_BACK = /\b(?:it|that|this|them|in|up|down|deal|party)$/i;
const POINTED_AT = /^\s*(?:(?:it|that|this|them|one)\b|(?:us|me) (?:up|in|down)\b(?!\s+for\b)|you\s*(?:[.!,;:]|$))/i;
const NAMES_ITS_OBJECT = /^\s+for\b/i;
const BARE_DEAL = /^deal$/i;
const BARE_AGREED = /^agreed$/i;
const BARE_MAX_WORDS = 2;
const OTHER_OPTION = /\b(?:instead|another|other|different|elsewhere|else)\b/i;
const OPTION_NOUN = /(?<![\w'])([a-z]+)\s+(?:job|posting|contract|quest|offer|work|run|caravan|commission)\b/gi;
const DETERMINERS = new Set(["the", "this", "that", "your", "its", "his", "her", "their", "our", "a", "an", "same", "one"]);
const DEAL_TERM = /\b(?:fee|fees|pay|paid|price|coin|coins|gold|silver|terms|bounty|reward|rate|wage|wages|money|job|posting|contract|commission|offer)\b/i;
const VALUE_WORD_MIN = 3;
const OBJECT_DENIED = /\b(?:nothing|nobody|none)\b/i;
const PROPER_NOUN = /(?<=[a-z,;]\s+)[A-Z][a-z]{2,}/g;
const TOPIC_STOP = new Set(["the", "our", "your", "their", "for", "and", "with", "then", "into", "from", "under", "that", "this"]);

const normalizeLine = (text: string): string => text.replace(/[‘’ʼ]/g, "'");

const lastBreak = (prefix: string, pattern: RegExp): number => {
  for (let at = prefix.length - 1; at >= 0; at -= 1) if (pattern.test(prefix[at])) return at + 1;
  return 0;
};

const sentenceStart = (text: string, index: number): number => lastBreak(text.slice(0, index), SENTENCE_BREAK);

const clauseBefore = (text: string, index: number): string => {
  const parts = text.slice(sentenceStart(text, index), index).split(CLAUSE_BREAK);
  return parts[parts.length - 1] ?? "";
};

const restOfSentence = (text: string, from: number): { text: string; end: string } => {
  const rest = text.slice(from);
  const end = rest.search(SENTENCE_BREAK);
  return end < 0 ? { text: rest, end: "" } : { text: rest.slice(0, end), end: rest[end] };
};

const clauseAfter = (text: string, from: number): string => {
  const rest = restOfSentence(text, from).text;
  const end = rest.search(CLAUSE_BREAK);
  return end < 0 ? rest : rest.slice(0, end);
};

const wordCount = (text: string): number => text.split(/[^A-Za-z0-9']+/).filter(Boolean).length;

const escapeWord = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wordsOf = (value: PrimitiveValue | undefined): string[] => typeof value === "string"
  ? value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= VALUE_WORD_MIN)
  : [];

const topicWords = (text: string): string[] => text.replace(/\\[a-z]/gi, " ").toLowerCase().split(/[^a-z]+/)
  .filter((word) => word.length >= VALUE_WORD_MIN && !TOPIC_STOP.has(word));

const wordMatcher = (words: string[]): RegExp | null => words.length ? new RegExp(`\\b(?:${words.map(escapeWord).join("|")})\\b`, "gi") : null;

interface Relevance {
  words: RegExp | null;
  valueWords: Set<string>;
  intents: RegExp[];
  partners: RegExp | null;
  topics: Set<string>;
}

interface Span {
  from: number;
  to: number;
}

const relevanceFor = (story: CommitStory, key: string, value: PrimitiveValue, partnerValues: PrimitiveValue[]): Relevance => {
  const words = wordsOf(value);
  const intents = story.transitions
    .filter((transition) => transition.extractor_trigger && gateLeaves(transition.gate).some((leaf) => leaf.q === key))
    .map((transition) => compile(transition.extractor_trigger, "gi"))
    .filter((matcher): matcher is RegExp => Boolean(matcher));
  const topics = new Set(intents.flatMap((intent) => topicWords(intent.source)));
  return { words: wordMatcher(words), valueWords: new Set(words), intents, partners: wordMatcher(partnerValues.flatMap(wordsOf)), topics };
};

const affirmedHit = (sentence: string, matcher: RegExp | null, verb: Span | null = null): boolean =>
  Boolean(matcher) && [...sentence.matchAll(matcher as RegExp)].some((hit) => {
    const from = hit.index ?? 0;
    const insideVerb = verb !== null && from >= verb.from && from + hit[0].length <= verb.to;
    return !insideVerb && !NEGATOR.test(clauseBefore(sentence, from));
  });

const namesOtherOption = (sentence: string, relevance: Relevance): boolean =>
  OTHER_OPTION.test(sentence) || [...sentence.matchAll(OPTION_NOUN)].some((hit) => {
    const modifier = hit[1].toLowerCase();
    return !DETERMINERS.has(modifier) && !relevance.valueWords.has(modifier);
  });

const isAbout = (text: string, relevance: Relevance): boolean =>
  affirmedHit(text, relevance.words) || relevance.intents.some((intent) => affirmedHit(text, intent));

const verbIsIntent = (sentence: string, verb: Span, relevance: Relevance): boolean =>
  relevance.intents.some((intent) => [...sentence.matchAll(intent)].some((hit) => {
    const from = hit.index ?? 0;
    return from >= verb.from && from + hit[0].length <= verb.to;
  }));

const objectIsTopic = (sentence: string, verb: Span, relevance: Relevance): boolean => {
  if (relevance.words || !verbIsIntent(sentence, verb, relevance)) return false;
  const object = clauseAfter(sentence, verb.to);
  if (NEGATOR.test(object) || OBJECT_DENIED.test(object)) return false;
  return topicWords(object).some((word) => relevance.topics.has(word));
};

const sentenceIsAbout = (text: string, index: number, length: number, relevance: Relevance, windowIsAbout: boolean): boolean => {
  const start = sentenceStart(text, index);
  const sentence = text.slice(start, index + length) + restOfSentence(text, index + length).text;
  if (affirmedHit(sentence, relevance.words)) return true;
  if (namesOtherOption(sentence, relevance)) return false;
  const verb = { from: index - start, to: index - start + length };
  if (relevance.intents.some((intent) => affirmedHit(sentence, intent, verb))) return true;
  if (!windowIsAbout) return false;
  if (objectIsTopic(sentence, verb, relevance)) return true;
  if (DEAL_TERM.test(text.slice(start, index))) return true;
  const clause = clauseBefore(text, index) + text.slice(index, index + length) + clauseAfter(text, index + length);
  return affirmedHit(clause, relevance.partners);
};

const isBareToken = (text: string, index: number, matched: string): boolean =>
  BARE_DEAL.test(matched.trim()) || (BARE_AGREED.test(matched.trim()) && wordCount(clauseBefore(text, index)) === 0);

const standsAlone = (text: string, index: number, matched: string): boolean =>
  wordCount(clauseBefore(text, index)) === 0 && wordCount(restOfSentence(text, index + matched.length).text) <= BARE_MAX_WORDS;

const pointsBack = (text: string, index: number, matched: string): boolean => {
  if (isBareToken(text, index, matched)) return standsAlone(text, index, matched);
  const after = text.slice(index + matched.length);
  return (POINTS_BACK.test(matched.trim()) && !NAMES_ITS_OBJECT.test(after)) || POINTED_AT.test(after);
};

export const HOLD_REASONS = {
  negated: "negated",
  hedged: "hedged",
  question: "asked as a question",
  unpointed: "names nothing it agrees to",
  offTopic: "not about this value",
  noMatch: "no player line names the commitment",
  noPlayerLine: "no player line in the window",
} as const;

export type HoldReason = (typeof HOLD_REASONS)[keyof typeof HOLD_REASONS];

const lineVerdict = (line: string, matcher: RegExp, relevance: Relevance, windowIsAbout: boolean): HoldReason | null => {
  const text = normalizeLine(line);
  const unbound = !relevance.words && !relevance.intents.length;
  let first: HoldReason | null = null;
  const miss = (reason: HoldReason) => { first ??= reason; };
  for (const match of text.matchAll(new RegExp(matcher.source, `${matcher.flags.replace("g", "")}g`))) {
    const index = match.index ?? 0;
    const before = clauseBefore(text, index);
    if (NEGATOR.test(before)) { miss(HOLD_REASONS.negated); continue; }
    if (HEDGE.test(before)) { miss(HOLD_REASONS.hedged); continue; }
    if (restOfSentence(text, index + match[0].length).end === "?") { miss(HOLD_REASONS.question); continue; }
    const bare = isBareToken(text, index, match[0]);
    if (bare && !pointsBack(text, index, match[0])) { miss(HOLD_REASONS.unpointed); continue; }
    if (unbound) return null;
    if (!bare && sentenceIsAbout(text, index, match[0].length, relevance, windowIsAbout)) return null;
    if (windowIsAbout && pointsBack(text, index, match[0])) return null;
    miss(HOLD_REASONS.offTopic);
  }
  return first ?? HOLD_REASONS.noMatch;
};

interface PlayerReading {
  commits: boolean;
  playerLine?: string;
  reason?: HoldReason;
}

const playerReading = (matcher: RegExp, relevance: Relevance, messages: readonly EvidenceMessage[]): PlayerReading => {
  const windowIsAbout = messages.some((message) => isAbout(normalizeLine(message.text), relevance));
  const named = messages.filter((message) => !message.isUser).flatMap((message) => normalizeLine(message.text).match(PROPER_NOUN) ?? []);
  const read = { ...relevance, topics: new Set([...relevance.topics, ...named.map((name) => name.toLowerCase())]) };
  const verdicts = messages.filter((message) => message.isUser).map((message) => ({ line: message.text, reason: lineVerdict(message.text, matcher, read, windowIsAbout) }));
  if (verdicts.some((verdict) => verdict.reason === null)) return { commits: true };
  const closest = [...verdicts].reverse().find((verdict) => verdict.reason !== HOLD_REASONS.noMatch) ?? verdicts[verdicts.length - 1];
  return closest ? { commits: false, playerLine: closest.line, reason: closest.reason ?? HOLD_REASONS.noMatch } : { commits: false, reason: HOLD_REASONS.noPlayerLine };
};

const gatePartners = (story: CommitStory, key: string): Set<string> => new Set(story.transitions
  .map((transition) => gateLeaves(transition.gate).map((leaf) => leaf.q))
  .filter((keys) => keys.includes(key))
  .flat()
  .filter((partner) => partner !== key));

export const applyCommitEvidence = (
  story: CommitStory,
  deltas: ParsedDelta[],
  windowMessages: () => readonly EvidenceMessage[],
  values: Readonly<Record<string, PrimitiveValue>> = {},
): CommitGuardResult => {
  const accepted: ParsedDelta[] = [];
  const held: HeldCommitDelta[] = [];
  let messages: readonly EvidenceMessage[] | null = null;
  for (const delta of deltas) {
    const matcher = compile(story.qualityByKey[delta.delta.q]?.commit_evidence, "i");
    if (matcher) {
      const partners = gatePartners(story, delta.delta.q);
      const partnerValues = [...deltas.filter((other) => partners.has(other.delta.q)).map((other) => other.delta.v),
        ...[...partners].map((partner) => values[partner]).filter((value): value is PrimitiveValue => value !== undefined)];
      const reading = playerReading(matcher, relevanceFor(story, delta.delta.q, delta.delta.v, partnerValues), messages ??= windowMessages());
      if (!reading.commits) {
        held.push({
          key: delta.delta.q, value: String(delta.delta.v), evidence: delta.evidence ?? "",
          ...(reading.reason ? { reason: reading.reason } : {}), ...(reading.playerLine !== undefined ? { playerLine: reading.playerLine } : {}),
        });
        continue;
      }
    }
    accepted.push(delta);
  }
  return { accepted, held };
};

import { gateLeaves, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { log } from "@utils/log";
import type { EvidenceMessage } from "./evidence";
import type { ParsedDelta } from "./types";

// A quality whose value only means something when the player COMMITTED to it can declare a
// `commit_evidence` pattern. A delta for it is accepted only when a line the player wrote, inside the
// window the read was given, commits to it: the pattern matches, no negator stands before the verb in
// the same clause ("we won't take it"), and the sentence is about the claimed value (the value's
// words, or the intent of a transition the value opens) unless the verb points back at something
// ("we'll do it", "count us in"), which then needs the window to be about it. Which line the read
// quoted does not decide it, and an NPC or narrator line saying the player agreed never stands in for
// the player's own words. Values with no pattern keep today's behaviour.
export type CommitStory = Pick<NormalizedStoryV2, "qualityByKey" | "transitions">;

export interface HeldCommitDelta {
  key: string;
  value: string;
  evidence: string;
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
const CLAUSE_BREAK = /[.!?\n,;:()\u2014\u2013]|\bbut\b|\bthough\b|\balthough\b/i;
const SENTENCE_BREAK = /[.!?\n]/;
const POINTS_BACK = /\b(?:it|that|this|them|in)$/i;
const POINTED_AT = /^\s*(?:it|that|this|them|one)\b/i;
const VALUE_WORD_MIN = 3;

const normalizeLine = (text: string): string => text.replace(/[\u2018\u2019\u02bc]/g, "'");

const lastBreak = (prefix: string, pattern: RegExp): number => {
  for (let at = prefix.length - 1; at >= 0; at -= 1) if (pattern.test(prefix[at])) return at + 1;
  return 0;
};

const clauseBefore = (text: string, index: number): string => {
  const parts = text.slice(lastBreak(text.slice(0, index), SENTENCE_BREAK), index).split(CLAUSE_BREAK);
  return parts[parts.length - 1] ?? "";
};

const sentenceAround = (text: string, index: number, length: number): string => {
  const start = lastBreak(text.slice(0, index), SENTENCE_BREAK);
  const rest = text.slice(index + length);
  const end = rest.search(SENTENCE_BREAK);
  return text.slice(start, end < 0 ? text.length : index + length + end);
};

const escapeWord = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Relevance {
  words: RegExp | null;
  intents: RegExp[];
}

const relevanceFor = (story: CommitStory, key: string, value: PrimitiveValue): Relevance => {
  const words = typeof value === "string"
    ? value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= VALUE_WORD_MIN)
    : [];
  const intents = story.transitions
    .filter((transition) => transition.extractor_trigger && gateLeaves(transition.gate).some((leaf) => leaf.q === key))
    .map((transition) => compile(transition.extractor_trigger, "i"))
    .filter((matcher): matcher is RegExp => Boolean(matcher));
  return { words: words.length ? new RegExp(`\\b(?:${words.map(escapeWord).join("|")})\\b`, "i") : null, intents };
};

const isAbout = (text: string, relevance: Relevance): boolean =>
  Boolean(relevance.words?.test(text)) || relevance.intents.some((intent) => intent.test(text));

const lineCommits = (line: string, matcher: RegExp, relevance: Relevance, windowIsAbout: boolean): boolean => {
  const text = normalizeLine(line);
  const unbound = !relevance.words && !relevance.intents.length;
  for (const match of text.matchAll(new RegExp(matcher.source, `${matcher.flags.replace("g", "")}g`))) {
    const index = match.index ?? 0;
    if (NEGATOR.test(clauseBefore(text, index))) continue;
    if (unbound || isAbout(sentenceAround(text, index, match[0].length), relevance)) return true;
    const pointsBack = POINTS_BACK.test(match[0].trim()) || POINTED_AT.test(text.slice(index + match[0].length));
    if (pointsBack && windowIsAbout) return true;
  }
  return false;
};

const playerCommits = (matcher: RegExp, relevance: Relevance, messages: readonly EvidenceMessage[]): boolean => {
  const windowIsAbout = messages.some((message) => isAbout(normalizeLine(message.text), relevance));
  return messages.some((message) => message.isUser && lineCommits(message.text, matcher, relevance, windowIsAbout));
};

export const applyCommitEvidence = (
  story: CommitStory,
  deltas: ParsedDelta[],
  windowMessages: () => readonly EvidenceMessage[],
): CommitGuardResult => {
  const accepted: ParsedDelta[] = [];
  const held: HeldCommitDelta[] = [];
  let messages: readonly EvidenceMessage[] | null = null;
  for (const delta of deltas) {
    const matcher = compile(story.qualityByKey[delta.delta.q]?.commit_evidence, "i");
    if (matcher && !playerCommits(matcher, relevanceFor(story, delta.delta.q, delta.delta.v), messages ??= windowMessages())) {
      held.push({ key: delta.delta.q, value: String(delta.delta.v), evidence: delta.evidence ?? "" });
      continue;
    }
    accepted.push(delta);
  }
  return { accepted, held };
};

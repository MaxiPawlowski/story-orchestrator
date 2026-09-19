import { PAIR_MIN_CONFIDENCE, PAIR_SAME_THING_BELOW, VERIFY_DOWNWEIGHT_BELOW, VERIFY_DROP_BELOW } from "./policy";
import { choice, choiceAnswer, noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export type JudgePairRelation = "duplicate" | "update" | "distinct" | "unrelated";

export const VERIFY_CRITERIA = {
  true: "The transcript states or clearly shows everything the note says",
  false: "The note adds something the transcript does not show: an invented detail, cause or outcome, the wrong person, the opposite of what happened, or a character's false claim stated as fact",
} as const;

export const PAIR_CRITERIA: Record<JudgePairRelation, string> = {
  duplicate: "The newer note restates the older one: the same fact about the same person, object or place, possibly reworded or with extra detail. Keeping both is redundant",
  update: "The newer note gives a new value for the very same fact about the very same person, object or place (a price that changed, someone who moved or died), so the older note is now out of date",
  distinct: "Worded alike or about the same character, but the notes concern a different object, a different person or a different fact, so both stay true",
  unrelated: "The notes are about different subjects",
};

export const PAIR_SAME_THING_CRITERIA = {
  true: "Both notes are about one and the same person, object or place, and the same property of it",
  false: "The notes are about different things, even if they share an owner, a place or most of their words: a sword and a dagger, the silver and the frames, one person and another",
} as const;

export interface VerifyInput {
  storyTitle: string;
  cast: string[];
  transcript: Array<{ id: string; speaker: string; text: string }>;
  lines: string[];
}

export type VerifyVerdict = { action: "keep" } | { action: "downweight"; confidence: number } | { action: "drop" };

// Spike wording (experiments/memory.mts): the story clause is what cut false flags from 17 to 8 of 93.
export function buildVerifyRequest(input: VerifyInput): JudgeRequest {
  return {
    state: { story: { title: input.storyTitle, cast: input.cast }, transcript: input.transcript },
    questions: Object.fromEntries(input.lines.map((line, index) => [`line:${index}`, noul(`Is this note supported by \`transcript\`: "${line}"? Use \`story\` only as background for names and places.`, { ...VERIFY_CRITERIA })])),
  };
}

export function verifyVerdict(p: number | null): VerifyVerdict {
  if (p === null) return { action: "keep" };
  if (p < VERIFY_DROP_BELOW) return { action: "drop" };
  if (p < VERIFY_DOWNWEIGHT_BELOW) return { action: "downweight", confidence: p };
  return { action: "keep" };
}

export const readVerify = (answers: Record<string, JudgeAnswer>, count: number): Array<number | null> => Array.from({ length: count }, (_, index) => noulAnswer(answers, `line:${index}`));

export function buildPairRequest(older: string, newer: string): JudgeRequest {
  return {
    state: { older_note: older, newer_note: newer },
    questions: {
      relation: choice("Compare `older_note` and `newer_note`, two notes from the same story's memory. What is the relationship between them?", { ...PAIR_CRITERIA }),
      same_thing: noul("Are `older_note` and `newer_note` about one and the same person, object or place, and the same property of it?", { ...PAIR_SAME_THING_CRITERIA }),
    },
  };
}

export interface PairRead {
  relation: JudgePairRelation;
  confidence: number;
  sameThing: number | null;
}

export function readPair(answers: Record<string, JudgeAnswer>): PairRead | null {
  const answer = choiceAnswer(answers, "relation");
  if (!answer || !(answer.choice in PAIR_CRITERIA)) return null;
  return { relation: answer.choice as JudgePairRelation, confidence: answer.confidence, sameThing: noulAnswer(answers, "same_thing") };
}

// A pair Jev thinks is more likely about two different things is kept, whatever the relation says:
// the wrong direction (superseding or dropping a true note about something else) is the costly one.
export const pairDecision = (read: PairRead | null): JudgePairRelation | null => {
  if (!read) return null;
  if (read.sameThing !== null && read.sameThing < PAIR_SAME_THING_BELOW) return read.relation === "unrelated" ? "unrelated" : "distinct";
  return read.confidence >= PAIR_MIN_CONFIDENCE ? read.relation : null;
};

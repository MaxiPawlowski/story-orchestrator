import { PAIR_MIN_CONFIDENCE, VERIFY_DOWNWEIGHT_BELOW, VERIFY_DROP_BELOW } from "./policy";
import { choice, choiceAnswer, noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export type JudgePairRelation = "duplicate" | "update" | "distinct" | "unrelated";

export const VERIFY_CRITERIA = {
  true: "The transcript states or clearly shows everything the note says",
  false: "The note adds something the transcript does not show: an invented detail, cause or outcome, the wrong person, the opposite of what happened, or a character's false claim stated as fact",
} as const;

export const PAIR_CRITERIA: Record<JudgePairRelation, string> = {
  duplicate: "The newer note says the same thing as the older one, possibly with extra detail; keeping both is redundant",
  update: "Both notes are about the same subject, but the newer one reports a change, so the older one is now out of date",
  distinct: "Same subject, but the newer note adds a different fact; both stay true",
  unrelated: "The notes are about different subjects",
};

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
    questions: { relation: choice("Compare `older_note` and `newer_note`, two notes from the same story's memory. What is the relationship between them?", { ...PAIR_CRITERIA }) },
  };
}

export function readPair(answers: Record<string, JudgeAnswer>): { relation: JudgePairRelation; confidence: number } | null {
  const answer = choiceAnswer(answers, "relation");
  if (!answer || !(answer.choice in PAIR_CRITERIA)) return null;
  return { relation: answer.choice as JudgePairRelation, confidence: answer.confidence };
}

export const pairDecision = (read: { relation: JudgePairRelation; confidence: number } | null): JudgePairRelation | null =>
  read && read.confidence >= PAIR_MIN_CONFIDENCE ? read.relation : null;

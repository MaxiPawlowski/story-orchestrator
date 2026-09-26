import { buildPairRequest, pairDecision, readPair } from "./memory";
import { PAIR_MIN_CONFIDENCE } from "./policy";
import { choice, choiceAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest, JudgeResult } from "./types";

export type ContradictionRelation = "agrees" | "contradicts" | "update" | "distinct";
export type ContradictionLabel = ContradictionRelation;
export type ReleaseWording = "a" | "b";

export const RELEASE_WORDINGS: readonly ReleaseWording[] = ["a", "b"];

export const CONTRADICTION_CRITERIA: Record<ContradictionRelation, string> = {
  agrees: "The new note is consistent with the settled fact: it restates it, rewords it, adds detail, or shows the same fact from another side, so both can be kept as true",
  contradicts: "The new note says the settled fact is false, or describes a state of the same person, object or place that cannot be true at the same time as the settled fact",
  update: "The new note reports a change that happened after the settled fact: it was true, and something since has made it no longer so",
  distinct: "The notes concern a different person, object or property, so both can be true whatever each says",
};

export function buildContradictionRequest(settled: string, claim: string): JudgeRequest {
  return {
    state: { settled_note: settled, new_note: claim },
    questions: {
      relation: choice(
        "`settled_note` is a fact the story has settled. `new_note` is a new note from the same story's memory. What does `new_note` do to `settled_note`?",
        { ...CONTRADICTION_CRITERIA },
      ),
    },
  };
}

export interface ContradictionRead {
  relation: ContradictionRelation;
  confidence: number;
}

export function readContradiction(answers: Record<string, JudgeAnswer>): ContradictionRead | null {
  const answer = choiceAnswer(answers, "relation");
  if (!answer || !(answer.choice in CONTRADICTION_CRITERIA)) return null;
  return { relation: answer.choice as ContradictionRelation, confidence: answer.confidence };
}

export const releaseByContradiction = (read: ContradictionRead | null): boolean => Boolean(read && read.relation === "agrees" && read.confidence >= PAIR_MIN_CONFIDENCE);

export function releaseByPairQuestion(answers: Record<string, JudgeAnswer>): boolean {
  const decision = pairDecision(readPair(answers));
  return decision === "duplicate" || decision === "distinct" || decision === "unrelated";
}

export const releaseRequest = (wording: ReleaseWording, settled: string, claim: string): JudgeRequest =>
  wording === "a" ? buildPairRequest(settled, claim) : buildContradictionRequest(settled, claim);

export function releaseDecision(wording: ReleaseWording, result: Pick<JudgeResult, "answers" | "fallback">): boolean {
  if (result.fallback || !result.answers) return false;
  return wording === "a" ? releaseByPairQuestion(result.answers) : releaseByContradiction(readContradiction(result.answers));
}

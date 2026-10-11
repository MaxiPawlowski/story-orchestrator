import { CANON_VERIFY_DROP_BELOW } from "./policy";
import { noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export const CANON_VERIFY_CRITERIA = {
  true: "The sources state or clearly imply everything the sentence says; condensing, combining or rewording them is fine",
  false: "The sentence adds something the sources do not say: an invented event, detail, number, cause or outcome, the wrong person, or the opposite of what happened",
} as const;

export interface CanonVerifyInput {
  storyTitle: string;
  cast: string[];
  checkpoint: { name: string; objective: string } | null;
  arcSummaries: string[];
  facts: string[];
  sentences: string[];
}

export const canonVerifyQuestion = (sentence: string): string =>
  `Is this sentence of the story's summary supported by \`arc_summaries\`, \`facts\` and \`checkpoint\`: "${sentence}"? Use \`story\` only for names.`;

export function buildCanonVerifyRequest(input: CanonVerifyInput): JudgeRequest {
  return {
    state: {
      story: { title: input.storyTitle, cast: input.cast },
      ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
      arc_summaries: Object.fromEntries(input.arcSummaries.map((summary, index) => [`arc_${index + 1}`, summary])),
      facts: Object.fromEntries(input.facts.map((fact, index) => [`fact_${index + 1}`, fact])),
    },
    questions: Object.fromEntries(input.sentences.map((sentence, index) => [`sentence:${index}`, noul(canonVerifyQuestion(sentence), { ...CANON_VERIFY_CRITERIA })])),
  };
}

export const readCanonVerify = (answers: Record<string, JudgeAnswer>, count: number): Array<number | null> =>
  Array.from({ length: count }, (_, index) => noulAnswer(answers, `sentence:${index}`));

export const canonSentenceDropped = (p: number | null): boolean => p !== null && p < CANON_VERIFY_DROP_BELOW;

const CANON_LABEL = /^\s*(WHAT HAS HAPPENED|CURRENT STATE|ESTABLISHED FACTS)\s*:\s*/i;

export interface CanonPiece {
  text: string;
  sentence: boolean;
}

export function canonPieces(text: string): CanonPiece[] {
  return text.split(/(\n+)/).flatMap((line): CanonPiece[] => {
    if (!line.trim()) return [{ text: line, sentence: false }];
    const label = line.match(CANON_LABEL);
    const head: CanonPiece[] = label ? [{ text: label[0], sentence: false }] : [];
    const rest = label ? line.slice(label[0].length) : line;
    const parts = rest.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)\s*/g) ?? [];
    return [...head, ...parts.filter((part) => part.length > 0).map((part) => ({ text: part, sentence: /\w/.test(part) }))];
  });
}

export const canonSentences = (pieces: CanonPiece[]): string[] => pieces.filter((piece) => piece.sentence).map((piece) => piece.text.trim());

export function withoutDroppedSentences(pieces: CanonPiece[], dropped: ReadonlySet<number>): string {
  let index = -1;
  const kept = pieces.map((piece) => {
    if (!piece.sentence) return piece.text;
    index += 1;
    return dropped.has(index) ? "" : piece.text;
  });
  return kept.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

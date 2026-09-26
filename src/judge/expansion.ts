import { CHAIN_WEIGHTS, CRITIC_ADVANCES_MIN, CRITIC_CONTRADICTS_MAX, CRITIC_MAX_FACTS, CRITIC_NEW_CHARACTER_MAX } from "./policy";
import { noul, noulAnswer, score, scoreAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export const CHAIN_SHAPE_LEVELS = [
  "The beats ignore the trajectory: their tension runs the opposite way or stays flat where it should move",
  "The beats follow the trajectory in one place and break it elsewhere",
  "The beats roughly follow the trajectory, with one step out of place",
  "The beats follow the trajectory closely, each step close to its target level",
  "The beats match the trajectory step for step",
];

export interface ChainInput {
  facts: string[];
  target: { name: string; objective: string };
  cast: string[];
  trajectory?: string[];
  beats: Array<{ objective: string; guidance?: string }>;
}

export interface ChainRead {
  contradicts: number;
  advances: number;
  newCharacter: number;
  shape: number | null;
}

// The spike's three critic nouls verbatim (experiments/guards.mts), plus the Phase A shape score
// when the story gives a tension trajectory. `cast` must include the player: the spike's K02 flagged
// the player's own name as a new character because its cast list left them out.
export function buildChainRequest(input: ChainInput): JudgeRequest {
  const trajectory = input.trajectory?.length ? input.trajectory : null;
  return {
    state: {
      established_facts: input.facts.slice(0, CRITIC_MAX_FACTS),
      target_checkpoint: input.target,
      cast: input.cast,
      ...(trajectory ? { tension_trajectory: trajectory } : {}),
      generated_beats: input.beats.map((beat) => (beat.guidance ? { objective: beat.objective, guidance: beat.guidance } : { objective: beat.objective })),
    },
    questions: {
      contradicts: noul(
        "Does any beat in `generated_beats` contradict one of `established_facts`?",
        { true: "A beat shows something an established fact rules out", false: "Every beat is compatible with every established fact" },
      ),
      advances: noul(
        "Do `generated_beats`, taken in order, move the story toward `target_checkpoint`?",
        { true: "The beats end at or clearly closer to the target", false: "The beats wander, go backwards, or make the target impossible" },
      ),
      newCharacter: noul(
        "Do `generated_beats` bring in a named character who is not in `cast`?",
        { true: "A new named person appears in a beat", false: "Only cast members or unnamed people appear" },
      ),
      ...(trajectory ? { shape: score("How closely do `generated_beats` follow `tension_trajectory`, one level per beat in order?", CHAIN_SHAPE_LEVELS) } : {}),
    },
  };
}

export function readChain(answers: Record<string, JudgeAnswer>): ChainRead | null {
  const contradicts = noulAnswer(answers, "contradicts");
  const advances = noulAnswer(answers, "advances");
  const newCharacter = noulAnswer(answers, "newCharacter");
  if (contradicts === null || advances === null || newCharacter === null) return null;
  const shape = scoreAnswer(answers, "shape");
  return { contradicts, advances, newCharacter, shape: shape ? shape.score / (CHAIN_SHAPE_LEVELS.length - 1) : null };
}

// Same shape as the LLM critic's verdict, so needsReview and the author card are unchanged. The
// issue strings are composed here from the failing checks; the judge supplies decisions, not prose.
export function judgeVerdict(read: ChainRead): { pass: boolean; issues: string[] } {
  const issues = [
    ...(read.contradicts >= CRITIC_CONTRADICTS_MAX ? [`A beat contradicts an established fact (judge p ${read.contradicts}).`] : []),
    ...(read.advances < CRITIC_ADVANCES_MIN ? [`The beats do not move toward the target checkpoint (judge p ${read.advances}).`] : []),
    ...(read.newCharacter >= CRITIC_NEW_CHARACTER_MAX ? [`A beat brings in a named character who is not in the cast (judge p ${read.newCharacter}).`] : []),
  ];
  return { pass: issues.length === 0, issues };
}

export const chainScore = (read: ChainRead) =>
  CHAIN_WEIGHTS.advances * read.advances + CHAIN_WEIGHTS.shape * (read.shape ?? 0) - CHAIN_WEIGHTS.contradicts * read.contradicts - CHAIN_WEIGHTS.newCharacter * read.newCharacter;

// Code's pick: the highest-scoring chain the judge passes; ties go to the lowest variant index.
export function pickChain(reads: Array<ChainRead | null>): number | null {
  let best: number | null = null;
  reads.forEach((read, index) => {
    if (!read || !judgeVerdict(read).pass) return;
    if (best === null || chainScore(read) > chainScore(reads[best]!)) best = index;
  });
  return best;
}

// The `llm` pick mode's prompt: the judge's top two, by beat objective only, answered PICK: A|B.
export function buildPickPrompt(target: ChainInput["target"], chains: [ChainInput["beats"], ChainInput["beats"]]): string {
  const render = (beats: ChainInput["beats"]) => beats.map((beat, index) => `${index + 1}. ${beat.objective}`).join("\n");
  return [
    `Two outlines lead the story to the checkpoint "${target.name}": ${target.objective}`,
    "Pick the one that reads as the better story: consistent, moving toward the checkpoint, with rising stakes.",
    `A:\n${render(chains[0])}`,
    `B:\n${render(chains[1])}`,
    "Answer with exactly one line: PICK: A or PICK: B",
  ].join("\n\n");
}

export const parsePick = (raw: string): 0 | 1 | null => {
  const match = raw.trim().match(/^PICK:\s*([AB])\s*$/im);
  return match ? (match[1].toUpperCase() === "A" ? 0 : 1) : null;
};

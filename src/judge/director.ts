import { DIRECTOR_ADDRESSED_WEIGHT, DIRECTOR_LEAD_BONUS, DIRECTOR_ROLE_CONFIDENCE, DIRECTOR_SILENCE } from "./policy";
import { choice, choiceAnswer, noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeOption, JudgeQuestion, JudgeRequest } from "./types";

export const DIRECTOR_NOBODY = "nobody";

export interface JudgeDirectorCandidate {
  rosterId: string;
  name: string;
  role?: string;
}

export interface JudgeDirectorInput {
  checkpointName: string;
  objective: string;
  instruction?: string;
  player: string;
  candidates: JudgeDirectorCandidate[];
  lead?: string;
  allowSilence: boolean;
  window: Array<{ speaker: string; text: string }>;
}

export type JudgeDirectorDecision =
  | { kind: "member"; rosterId: string; name: string; confidence: number; via: "choice" | "composite" }
  | { kind: "silence"; confidence: number; via: "choice" | "composite" };

const normalize = (value: string) => value.trim().toLowerCase();

export function directorJudgeEligible(candidates: JudgeDirectorCandidate[], allowSilence: boolean): boolean {
  if (candidates.length + (allowSilence ? 1 : 0) < 2) return false;
  if (!candidates.every((candidate) => Boolean(candidate.role?.trim()))) return false;
  const names = candidates.map((candidate) => normalize(candidate.name));
  return new Set(names).size === names.length && !names.includes(DIRECTOR_NOBODY);
}

const describe = (candidate: JudgeDirectorCandidate) => `${candidate.name} (${candidate.role?.trim() ?? candidate.name})`;

export function buildDirectorRequest(input: JudgeDirectorInput): JudgeRequest {
  const lines = [
    "Decide which character should speak next, in response to the latest message in `transcript`.",
    "Pick the character who was addressed, challenged, or has the strongest reason to react.",
    ...(input.lead ? [`If nobody in particular is addressed, prefer ${input.lead}, the scene lead.`] : []),
    ...(input.instruction ? [`Author guidance: ${input.instruction}`] : []),
    ...(input.allowSilence ? [`Pick "${DIRECTOR_NOBODY}" if no character has a reason to respond.`] : []),
  ];
  const silence: Record<string, JudgeOption> = input.allowSilence ? { [DIRECTOR_NOBODY]: "No character should respond right now" } : {};
  const questions: Record<string, JudgeQuestion> = {
    who: choice(lines.join(" "), { ...Object.fromEntries(input.candidates.map((candidate) => [candidate.name, candidate.role?.trim() ?? null])), ...silence }),
    nobody: noul("Is the latest message in `transcript` something no character needs to respond to, such as the player quietly acting alone or going to sleep?"),
  };
  input.candidates.forEach((candidate) => {
    questions[`addr:${candidate.rosterId}`] = noul(`Is the latest message in \`transcript\` directed at ${describe(candidate)}, by name, title, role or context?`);
    questions[`reason:${candidate.rosterId}`] = noul(`Does ${describe(candidate)} have a strong reason to respond to the latest message in \`transcript\` right now?`);
  });
  return {
    state: {
      scene: { name: input.checkpointName, goal: input.objective, ...(input.instruction ? { author_guidance: input.instruction } : {}) },
      player: input.player,
      transcript: input.window.map((message) => ({ speaker: message.speaker, text: message.text })),
    },
    questions,
  };
}

export function decideDirector(answers: Record<string, JudgeAnswer>, input: JudgeDirectorInput): JudgeDirectorDecision | null {
  const picked = choiceAnswer(answers, "who");
  if (picked && picked.confidence >= DIRECTOR_ROLE_CONFIDENCE) {
    if (normalize(picked.choice) === DIRECTOR_NOBODY) {
      if (input.allowSilence) return { kind: "silence", confidence: picked.confidence, via: "choice" };
    } else {
      const candidate = input.candidates.find((entry) => normalize(entry.name) === normalize(picked.choice));
      if (candidate) return { kind: "member", rosterId: candidate.rosterId, name: candidate.name, confidence: picked.confidence, via: "choice" };
    }
  }
  const scores = input.candidates.map((candidate) => ({ candidate, addr: noulAnswer(answers, `addr:${candidate.rosterId}`), reason: noulAnswer(answers, `reason:${candidate.rosterId}`) }));
  if (scores.some((entry) => entry.addr === null || entry.reason === null)) return null;
  const nobody = noulAnswer(answers, "nobody");
  const maxAddressed = Math.max(...scores.map((entry) => entry.addr ?? 0));
  if (input.allowSilence && nobody !== null && nobody > DIRECTOR_SILENCE.nobody && maxAddressed < DIRECTOR_SILENCE.maxAddressed) {
    return { kind: "silence", confidence: nobody, via: "composite" };
  }
  const leadName = input.lead ? normalize(input.lead) : null;
  const ranked = scores
    .map((entry) => ({ ...entry, total: DIRECTOR_ADDRESSED_WEIGHT * (entry.addr ?? 0) + (entry.reason ?? 0) + (leadName && normalize(entry.candidate.name) === leadName ? DIRECTOR_LEAD_BONUS : 0) }))
    .sort((left, right) => right.total - left.total);
  const top = ranked[0];
  if (!top) return null;
  return { kind: "member", rosterId: top.candidate.rosterId, name: top.candidate.name, confidence: picked?.confidence ?? 0, via: "composite" };
}

export function directorRecordP(answers: Record<string, JudgeAnswer> | null, decision: JudgeDirectorDecision | null): Record<string, number | string> {
  const p: Record<string, number | string> = {};
  const picked = answers ? choiceAnswer(answers, "who") : null;
  if (picked) {
    p.who = picked.choice;
    p.whoConfidence = picked.confidence;
  }
  if (decision) p.via = decision.via;
  if (decision?.kind === "member") p.picked = decision.name;
  if (decision?.kind === "silence") p.picked = DIRECTOR_NOBODY;
  return p;
}

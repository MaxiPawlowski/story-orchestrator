import { BACKGROUND_CONFIDENCE, BACKGROUND_MAX_OPTIONS, CONTINUITY_MAX_FACTS, CONTINUITY_MAX_NOTE_FACTS, CONTINUITY_P } from "./policy";
import { choice, choiceAnswer, noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export const CONTINUITY_CRITERIA = {
  true: "The reply and the fact cannot both be true: the reply shows or narrates something the fact rules out, or a character knows something the fact says they do not",
  false: "Both can be true: the reply agrees with the fact, does not touch it, or only shows a suspicion or a character's own claim",
} as const;

// Spike wording (experiments/guards.mts): one noul per established fact over the reply.
export function buildContinuityRequest(reply: { speaker: string; text: string }, facts: string[]): JudgeRequest {
  const kept = facts.slice(0, CONTINUITY_MAX_FACTS);
  return {
    state: { established_facts: Object.fromEntries(kept.map((fact, index) => [`fact_${index}`, fact])), reply },
    questions: Object.fromEntries(kept.map((_, index) => [`fact:${index}`, noul(`Does \`reply\` contradict \`established_facts.fact_${index}\`?`, { ...CONTINUITY_CRITERIA })])),
  };
}

export interface ContinuityNote {
  facts: string[];
  text: string;
}

// The judge decides which facts were broken; the note itself is composed here, verbatim, so the
// author can see exactly what was asserted to the model.
export function continuityNote(answers: Record<string, JudgeAnswer>, facts: string[]): ContinuityNote | null {
  const broken = facts.slice(0, CONTINUITY_MAX_FACTS)
    .map((fact, index) => ({ fact, p: noulAnswer(answers, `fact:${index}`) ?? 0 }))
    .filter((entry) => entry.p >= CONTINUITY_P)
    .sort((left, right) => right.p - left.p)
    .slice(0, CONTINUITY_MAX_NOTE_FACTS)
    .map((entry) => entry.fact);
  return broken.length ? { facts: broken, text: broken.map((fact) => `Continuity: established — ${fact} Keep the next reply consistent with it.`).join("\n") } : null;
}

export interface SceneDescriptionInput {
  checkpointName: string;
  objective: string;
  location?: string | null;
  time?: string | null;
  messages: Array<{ speaker: string; text: string }>;
}

export function sceneDescription(input: SceneDescriptionInput): string {
  const where = [input.location ? `at ${input.location}` : "", input.time && input.time !== "unclear" ? `at ${input.time}` : ""].filter(Boolean).join(", ");
  const lines = input.messages.slice(-2).map((message) => `${message.speaker}: ${message.text}`);
  return [`${input.checkpointName} — ${input.objective}${where ? ` (${where})` : ""}.`, ...lines].join("\n");
}

const tokens = (text: string) => new Set(text.toLowerCase().replace(/\.[a-z0-9]+$/, "").split(/[^a-z0-9]+/).filter((token) => token.length > 2));

// Utility files (leading underscore: `_black.jpg`, `__transparent.png`) are never a scene. Past the
// choice cap, the names sharing the most words with the scene are kept.
export function backgroundCandidates(names: string[], description: string): string[] {
  const usable = [...new Set(names)].filter((name) => name && !name.startsWith("_"));
  if (usable.length <= BACKGROUND_MAX_OPTIONS) return usable;
  const scene = tokens(description);
  const overlap = (name: string) => [...tokens(name)].filter((token) => scene.has(token)).length;
  return usable.map((name, index) => ({ name, index, score: overlap(name) })).sort((left, right) => right.score - left.score || left.index - right.index).slice(0, BACKGROUND_MAX_OPTIONS).map((entry) => entry.name);
}

export const BACKGROUND_NONE = "none";

// Spike wording (experiments/stagecraft.mts): one choice over the installed file names, plus none.
export function buildBackgroundRequest(names: string[], description: string): JudgeRequest {
  return {
    state: { scene: description },
    questions: {
      pick: choice("Which installed background image best fits `scene`? File names describe the picture. Pick \"none\" if no background fits the setting.", {
        ...Object.fromEntries(names.map((name) => [name, null])),
        [BACKGROUND_NONE]: "No installed background fits this setting",
      }),
    },
  };
}

export function readBackground(answers: Record<string, JudgeAnswer>, names: string[]): { name: string; confidence: number } | null {
  const answer = choiceAnswer(answers, "pick");
  if (!answer || (answer.choice !== BACKGROUND_NONE && !names.includes(answer.choice))) return null;
  return { name: answer.choice, confidence: answer.confidence };
}

// A change only when the judge names a real file with confidence, and it is not already showing.
export function backgroundDecision(read: { name: string; confidence: number } | null, current: string | null): string | null {
  if (!read || read.name === BACKGROUND_NONE || read.confidence < BACKGROUND_CONFIDENCE || read.name === current) return null;
  return read.name;
}

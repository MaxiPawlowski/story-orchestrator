import { LORE_CHUNK, LORE_CONTENT_CHARS } from "./policy";
import { score, scoreAnswer } from "./questions";
import { type LoreRelevance } from "./loreRanking";
import type { LoreEntry, LoreScene } from "./lore";
import type { JudgeAnswer, JudgeRequest } from "./types";

// v2.3 plan 10 (A) — the MEASUREMENT arm. `buildLoreRequests` asks a Noul per entry, which answers
// "does the next reply need this" and nothing about order, so equal answers fall to insertion order.
// This asks one Score per entry over described levels, which is a ranking primitive. Nothing here is
// wired into the runtime: `LoreSelector` still calls the Noul arm, and this replaces it only if the
// comparison run clears the declared floors.
//
// The scale is FINER than the four labels on purpose. The labels grade the truth; the question grades
// the model's answer, and a four-step question reproduces the tie it is meant to remove.
export const LORE_RELEVANCE_SCALE = [
  "irrelevant: about something that is not part of this scene at all",
  "background: only general information about the whole world, with nothing specific to this scene",
  "related: about something near this scene — the same region, family, faction or era — but not in it",
  "present: about someone or something in this scene, without bearing on what happens next",
  "useful: the next reply would be better grounded with these facts",
  "needed: the next reply cannot be written correctly without these facts",
] as const;

export const LORE_RELEVANCE_SCALE_TOP = LORE_RELEVANCE_SCALE.length - 1;
export const LORE_USEFUL_FROM = 4;

const clip = (text: string) => (text.length <= LORE_CONTENT_CHARS ? text : `${text.slice(0, LORE_CONTENT_CHARS).trimEnd()}…`);

export function buildLoreScoreRequests(candidates: LoreEntry[], scene: LoreScene): Array<{ request: JudgeRequest; entries: LoreEntry[] }> {
  const sceneState = {
    scene: { name: scene.checkpointName, goal: scene.objective },
    transcript: scene.window.map((line, index) => ({ id: `msg_${index + 1}`, speaker: line.speaker, text: line.text })),
  };
  const chunks: LoreEntry[][] = [];
  for (let start = 0; start < candidates.length; start += LORE_CHUNK) chunks.push(candidates.slice(start, start + LORE_CHUNK));
  return chunks.map((entries) => ({
    entries,
    request: {
      state: sceneState,
      questions: Object.fromEntries(entries.map((entry, index) => [`e:${index}`, score(`How relevant are the specific facts in this lore entry to the next reply in \`transcript\`? Entry "${entry.comment}": ${clip(entry.content)}`, [...LORE_RELEVANCE_SCALE])])),
    },
  }));
}

export const scoreToLevel = (value: number): number => Math.max(0, Math.min(LORE_RELEVANCE_SCALE_TOP, Math.round(value)));

/** The four labels are the coarse truth; the scale above is what the judge is asked for. */
export const scaleToLevel = (value: number): LoreRelevance => {
  const level = scoreToLevel(value);
  if (level >= LORE_USEFUL_FROM) return level === LORE_USEFUL_FROM ? "useful" : "needed";
  return level === 0 ? "irrelevant" : "background";
};

export interface LoreScored {
  entry: LoreEntry;
  /** The scale value rounded to 0..5 (Math.round); the raw answer is not kept here. */
  level: number;
  label: LoreRelevance;
}

export function readLoreScores(answers: Record<string, JudgeAnswer>, entries: LoreEntry[]): LoreScored[] {
  return entries.flatMap((entry, index) => {
    const answer = scoreAnswer(answers, `e:${index}`);
    if (!answer) return [];
    const level = scoreToLevel(answer.score);
    return [{ entry, level, label: scaleToLevel(answer.score) }];
  });
}


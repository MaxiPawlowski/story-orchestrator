import { LORE_CHUNK, LORE_CONTENT_CHARS, LORE_MAX_TOP_K, LORE_MIN_P, LORE_TOP_K } from "./policy";
import { noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeRequest } from "./types";

export interface LoreEntry {
  world: string;
  uid: number;
  comment: string;
  content: string;
  disable?: boolean;
  constant?: boolean;
}

export interface LoreScope {
  lorebooks: string[];
  topK?: number;
  minP?: number;
}

export interface LoreScene {
  checkpointName: string;
  objective: string;
  window: Array<{ speaker: string; text: string }>;
}

export interface LorePick {
  entry: LoreEntry;
  p: number;
}

// Revised at calibration: the spike's wording rated a world's general overview entry
// "active" in every scene (0.65-0.84 in 13 of 16 windows), which took a top-k slot each time.
export const LORE_QUESTION_CRITERIA = {
  true: "The entry is about a specific person, place, group, creature or thing that is present, being talked about, or about to matter in this scene",
  false: "The entry is about something that is not part of this scene, or it is only general background about the whole world",
} as const;

export const loreKey = (entry: Pick<LoreEntry, "world" | "uid">) => `${entry.world}.${entry.uid}`;

// Only what the author listed, and only what ST would scan and not already insert: a disabled
// entry is skipped before external activation (world-info.js:4801), a constant one is always in.
export function loreCandidates(entries: LoreEntry[], lorebooks: string[]): LoreEntry[] {
  const scope = new Set(lorebooks);
  return entries.filter((entry) => scope.has(entry.world) && !entry.disable && !entry.constant && entry.content.trim().length > 0);
}

const clip = (text: string) => (text.length <= LORE_CONTENT_CHARS ? text : `${text.slice(0, LORE_CONTENT_CHARS).trimEnd()}…`);

// One noul per entry over one shared scene state (spike shape, experiments/stagecraft.mts).
export function buildLoreRequests(candidates: LoreEntry[], scene: LoreScene): Array<{ request: JudgeRequest; entries: LoreEntry[] }> {
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
      // Content stays inline: measured moving the entry into a state field and
      // referencing it dropped lore recall to 67-74% against a 0.8 floor (verify notes and
      // continuity facts, which are short, held in state at 98-100%).
      questions: Object.fromEntries(entries.map((entry, index) => [
        `e:${index}`,
        noul(`Does the next reply in \`transcript\` need the specific facts in this lore entry? Entry "${entry.comment}": ${clip(entry.content)}`, { ...LORE_QUESTION_CRITERIA }),
      ])),
    },
  }));
}

export function readLore(answers: Record<string, JudgeAnswer>, entries: LoreEntry[]): LorePick[] {
  return entries.flatMap((entry, index) => {
    const p = noulAnswer(answers, `e:${index}`);
    return p === null ? [] : [{ entry, p }];
  });
}

export const loreTopK = (scope: Pick<LoreScope, "topK">) => Math.max(1, Math.min(LORE_MAX_TOP_K, Math.round(scope.topK ?? LORE_TOP_K)));

export function pickLore(scored: LorePick[], scope: Pick<LoreScope, "topK" | "minP">): LorePick[] {
  const minP = scope.minP ?? LORE_MIN_P;
  return scored.filter((pick) => pick.p >= minP).sort((left, right) => right.p - left.p || left.entry.uid - right.entry.uid).slice(0, loreTopK(scope));
}

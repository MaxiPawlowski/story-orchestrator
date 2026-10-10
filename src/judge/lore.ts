import { LORE_CONTENT_CHARS, LORE_MAX_TOP_K, LORE_MIN_P, LORE_REQUEST_TOKENS, LORE_TOP_K } from "./policy";
import { noul, noulAnswer } from "./questions";
import { JUDGE_CHARS_PER_TOKEN, type JudgeAnswer, type JudgeNoulQuestion, type JudgeRequest } from "./types";

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

const loreQuestion = (entry: LoreEntry): JudgeNoulQuestion => noul(
  `Does the next reply in \`transcript\` need the specific facts in this lore entry? Entry "${entry.comment}": ${clip(entry.content)}`,
  { ...LORE_QUESTION_CRITERIA },
);

const questionId = (index: number) => `e:${index}`;

const packed = (sizes: number[], room: number, target: number): number[][] => {
  const chunks: number[][] = [];
  let current: number[] = [];
  let used = 0;
  sizes.forEach((size, index) => {
    if (current.length && used + size > room) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(index);
    used += size;
    if (used >= target && index < sizes.length - 1) {
      chunks.push(current);
      current = [];
      used = 0;
    }
  });
  if (current.length) chunks.push(current);
  return chunks;
};

export function loreChunks(sizes: number[], room: number): number[][] {
  const fewest = packed(sizes, room, Infinity);
  if (fewest.length < 2) return fewest;
  const even = packed(sizes, room, sizes.reduce((sum, size) => sum + size, 0) / fewest.length);
  return even.length === fewest.length ? even : fewest;
}

// One noul per entry over one shared scene state (spike shape, experiments/stagecraft.mts).
// Content stays inline: measured moving the entry into a state field and referencing it dropped lore
// recall to 67-74% against a 0.8 floor (verify notes and continuity facts, which are short, held in state at 98-100%).
export function buildLoreRequests(candidates: LoreEntry[], scene: LoreScene, maxTokens = LORE_REQUEST_TOKENS): Array<{ request: JudgeRequest; entries: LoreEntry[] }> {
  const sceneState = {
    scene: { name: scene.checkpointName, goal: scene.objective },
    transcript: scene.window.map((line, index) => ({ id: `msg_${index + 1}`, speaker: line.speaker, text: line.text })),
  };
  const questions = candidates.map(loreQuestion);
  const base = JSON.stringify({ state: sceneState, questions: {} }).length;
  const sizes = questions.map((question, index) => JSON.stringify(questionId(index)).length + JSON.stringify(question).length + 2);
  const room = Math.floor(maxTokens * JUDGE_CHARS_PER_TOKEN) - base;
  return loreChunks(sizes, room).map((indexes) => ({
    entries: indexes.map((index) => candidates[index]),
    request: {
      state: sceneState,
      questions: Object.fromEntries(indexes.map((index, position) => [questionId(position), questions[index]])),
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

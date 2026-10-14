import { choice } from "@judge/questions";
import type { JudgeRequest } from "@judge/types";
import { DEFAULT_SCORE_WEIGHTS } from "./score";
import { jaccardSimilarity } from "./similarity";

export const E0_CUTOFF = 4;
export const E0_POOL_SIZE = 8;
export const E0_PROTECT = 5;
export const E0_MIN_QUESTIONS = 40;
export const E0_CHOICE_CALLS = 4;
export const E0_BAND_THRESHOLDS = [0.82, 0.7, 0.55, 0.4] as const;
export const E0_FLOORS = { hitAt4: 0.8, mrrMargin: 0.1, poolRecall: 0.8, slack: 1e-9 } as const;
export const E0_LOCAL_WEIGHTS = {
  similarity: DEFAULT_SCORE_WEIGHTS.semanticSimilarity,
  proximity: DEFAULT_SCORE_WEIGHTS.temporalProximity,
  distance: 20,
} as const;

export type E0ArmId = "a" | "b" | "c" | "d" | "e";
export const E0_COST_ORDER: readonly E0ArmId[] = ["e", "c", "a", "b", "d"];
export const E0_ARMS: Record<E0ArmId, { label: string; bands: readonly number[]; vectorQueries: number; judgeCalls: number }> = {
  a: { label: "bands 0.82/0.55", bands: [0.82, 0.55], vectorQueries: 2, judgeCalls: 0 },
  b: { label: "bands 0.82/0.7/0.55/0.4", bands: [0.82, 0.7, 0.55, 0.4], vectorQueries: 4, judgeCalls: 0 },
  c: { label: "local Jaccard + recency", bands: [], vectorQueries: 0, judgeCalls: 0 },
  d: { label: "judge Choice with removal", bands: [], vectorQueries: 0, judgeCalls: E0_CHOICE_CALLS },
  e: { label: "ST score order", bands: [], vectorQueries: 0, judgeCalls: 0 },
};

export interface E0Candidate {
  messageId: number;
  textHash: string;
  text: string;
  stRank: number;
  bands: number[];
}

export interface E0PoolQuestion {
  id: string;
  askMessageId: number;
  query: string;
  gold: number[];
  candidates: E0Candidate[];
  latencyMs?: { pool: number; bands: Record<string, number> };
}

export interface E0Ranked {
  order: number[];
  scores: number[];
  calls: number;
  latencyMs: number | null;
  inputTokens: number;
}

export interface E0ChoiceCall {
  pick: number | null;
  latencyMs: number;
  inputTokens: number;
}

export type E0Recorded = Record<string, E0ChoiceCall[]>;

const byScore = (scores: Map<number, number>) => (left: E0Candidate, right: E0Candidate): number =>
  (scores.get(right.messageId) ?? 0) - (scores.get(left.messageId) ?? 0) || left.stRank - right.stRank || left.messageId - right.messageId;

export function rankByScore(candidates: readonly E0Candidate[], scoreOf: (candidate: E0Candidate) => number): { order: number[]; scores: number[] } {
  const scores = new Map(candidates.map((candidate) => [candidate.messageId, scoreOf(candidate)]));
  const sorted = [...candidates].sort(byScore(scores));
  return { order: sorted.map((candidate) => candidate.messageId), scores: sorted.map((candidate) => scores.get(candidate.messageId) ?? 0) };
}

const vectorLatency = (question: E0PoolQuestion, bands: readonly number[]): number | null => {
  const recorded = question.latencyMs;
  if (!recorded) return null;
  const parts = bands.map((band) => recorded.bands[String(band)]);
  return parts.some((part) => typeof part !== "number") ? null : parts.reduce((sum, part) => sum + part, recorded.pool);
};

const bandArm = (bands: readonly number[]) => (question: E0PoolQuestion): E0Ranked => ({
  ...rankByScore(question.candidates, (candidate) => bands.filter((band) => candidate.bands.includes(band)).length),
  calls: 0,
  latencyMs: vectorLatency(question, bands),
  inputTokens: 0,
});

export const localScore = (question: E0PoolQuestion, candidate: E0Candidate): number =>
  E0_LOCAL_WEIGHTS.similarity * jaccardSimilarity(question.query, candidate.text)
  + E0_LOCAL_WEIGHTS.proximity / (1 + Math.max(0, question.askMessageId - candidate.messageId) / E0_LOCAL_WEIGHTS.distance);

export const armA = bandArm(E0_ARMS.a.bands);
export const armB = bandArm(E0_ARMS.b.bands);

export const armC = (question: E0PoolQuestion): E0Ranked => ({
  ...rankByScore(question.candidates, (candidate) => localScore(question, candidate)),
  calls: 0,
  latencyMs: vectorLatency(question, []),
  inputTokens: 0,
});

export const armE = (question: E0PoolQuestion): E0Ranked => ({
  ...rankByScore(question.candidates, (candidate) => -candidate.stRank),
  calls: 0,
  latencyMs: vectorLatency(question, []),
  inputTokens: 0,
});

export const E0_CHOICE_KEY = "best";

export function e0ChoiceRequest(query: string, remaining: readonly E0Candidate[]): JudgeRequest {
  const options = Object.fromEntries(remaining.map((candidate) => [`m${candidate.messageId}`, candidate.text]));
  return {
    state: { question: query },
    questions: {
      [E0_CHOICE_KEY]: choice("`question` asks what a character exactly said, promised or called something earlier in a group chat. Which past message answers it word for word?", options),
    },
  };
}

export const e0ChoicePick = (choiceId: string | null | undefined): number | null => {
  const match = /^m(\d+)$/.exec(choiceId ?? "");
  return match ? Number(match[1]) : null;
};

export function armD(question: E0PoolQuestion, calls: readonly E0ChoiceCall[] | undefined): E0Ranked | { refused: string } {
  if (!calls) return { refused: "no recorded calls" };
  if (calls.length < E0_CHOICE_CALLS) return { refused: `${calls.length} of ${E0_CHOICE_CALLS} calls recorded` };
  const used = calls.slice(0, E0_CHOICE_CALLS);
  const remaining = new Set(question.candidates.map((candidate) => candidate.messageId));
  const picks: number[] = [];
  for (const call of used) {
    if (call.pick === null || !remaining.has(call.pick)) continue;
    picks.push(call.pick);
    remaining.delete(call.pick);
  }
  const scores = new Map(picks.map((id, index) => [id, E0_POOL_SIZE - index]));
  return {
    ...rankByScore(question.candidates, (candidate) => scores.get(candidate.messageId) ?? 0),
    calls: used.length,
    latencyMs: used.reduce((sum, call) => sum + call.latencyMs, 0),
    inputTokens: used.reduce((sum, call) => sum + call.inputTokens, 0),
  };
}

export function checkOrder(question: E0PoolQuestion, order: readonly number[]): string | null {
  const pool = question.candidates.map((candidate) => candidate.messageId);
  if (pool.length !== E0_POOL_SIZE) return `pool holds ${pool.length} ids, contract is ${E0_POOL_SIZE}`;
  if (order.length !== pool.length) return `order holds ${order.length} of ${pool.length} ids`;
  if (new Set(order).size !== order.length) return "order repeats an id";
  const outside = order.filter((id) => !pool.includes(id));
  return outside.length ? `order adds ${outside.join(", ")}` : null;
}

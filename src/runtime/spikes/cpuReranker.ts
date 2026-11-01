import type { E0PoolQuestion, E0Ranked } from "@memory/e0Ranking";
import { scoreRankings, type E0ArmMetrics } from "@memory/e0Score";
import type { LoreRankTurn, LoreRelevance } from "@judge/loreRanking";
import { isRecord } from "@utils/guards";

export const RERANK_PATH = "/v1/rerank";
export const RERANK_TIMEOUT_MS = 1500;
export const RERANK_DOCS_MAX = 32;
export const RERANK_DOC_CHARS_MAX = 2000;
export const RERANK_MODEL_ASK = { primary: "bge-reranker-v2-m3 GGUF Q8_0 (568M params, about 0.6 GB)", fallback: "jina-reranker-v1-tiny-en GGUF F16 (33M params, about 70 MB, English)" } as const;
export const RERANK_FLOORS = { e0HitAt4: 0.8, e0GainOverArmC: 0, lorePrecisionGain: 0.05, latencyP95Ms: 150 } as const;

export interface RerankScore {
  index: number;
  score: number;
}

export type RerankResult =
  | { ok: true; scores: RerankScore[]; latencyMs: number }
  | { ok: false; reason: "no-endpoint" | "empty" | "http" | "timeout" | "network" | "shape"; detail?: string };

export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface RerankClientOptions {
  endpoint: string | null;
  fetch: FetchLike;
  now?: () => number;
  timeoutMs?: number;
  model?: string;
}

export const rerankUrl = (endpoint: string): string => `${endpoint.replace(/\/+$/, "").replace(/\/v1$/, "")}${RERANK_PATH}`;

export const rerankBody = (query: string, documents: readonly string[], model?: string) => ({
  ...(model ? { model } : {}),
  query,
  documents: documents.slice(0, RERANK_DOCS_MAX).map((document) => document.slice(0, RERANK_DOC_CHARS_MAX)),
  top_n: Math.min(documents.length, RERANK_DOCS_MAX),
});

export const parseRerankResponse = (value: unknown, count: number): RerankScore[] | null => {
  const results = isRecord(value) && Array.isArray(value.results) ? value.results : null;
  if (!results) return null;
  const scores: RerankScore[] = [];
  for (const row of results) {
    if (!isRecord(row)) return null;
    const index = row.index;
    const score = typeof row.relevance_score === "number" ? row.relevance_score : row.score;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= count || typeof score !== "number" || !Number.isFinite(score)) return null;
    scores.push({ index, score });
  }
  return scores.sort((left, right) => right.score - left.score || left.index - right.index);
};

export const createRerankClient = (options: RerankClientOptions) => async (query: string, documents: readonly string[]): Promise<RerankResult> => {
  if (!options.endpoint) return { ok: false, reason: "no-endpoint" };
  if (!documents.length || !query.trim()) return { ok: false, reason: "empty" };
  const now = options.now ?? (() => Date.now());
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? RERANK_TIMEOUT_MS) : null;
  const started = now();
  try {
    const response = await options.fetch(rerankUrl(options.endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rerankBody(query, documents, options.model)),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) return { ok: false, reason: "http", detail: String(response.status) };
    const scores = parseRerankResponse(await response.json(), Math.min(documents.length, RERANK_DOCS_MAX));
    return scores ? { ok: true, scores, latencyMs: now() - started } : { ok: false, reason: "shape" };
  } catch {
    return { ok: false, reason: controller?.signal.aborted ? "timeout" : "network" };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export type RecordedRerank = Record<string, { scores: number[]; latencyMs: number }>;

export type E0RerankArm = { metrics: E0ArmMetrics; owed: null } | { metrics: null; owed: string };

export function rerankE0Arm(questions: readonly E0PoolQuestion[], recorded: RecordedRerank | undefined): E0RerankArm {
  if (!recorded) return { metrics: null, owed: "no recorded reranker scores: GPU/CPU row SP-CR needs the owner's model download OK" };
  const missing = questions.filter((question) => recorded[question.id]?.scores.length !== question.candidates.length);
  if (missing.length) return { metrics: null, owed: `recorded scores missing or short for ${missing.length} question(s)` };
  const rankings = new Map<string, E0Ranked>(questions.map((question) => {
    const { scores, latencyMs } = recorded[question.id] as { scores: number[]; latencyMs: number };
    const order = question.candidates.map((candidate, index) => ({ id: candidate.messageId, score: scores[index] as number, index }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const chars = question.query.length + question.candidates.reduce((sum, candidate) => sum + candidate.text.length, 0);
    return [question.id, { order: order.map((entry) => entry.id), scores: order.map((entry) => entry.score), calls: 1, latencyMs, inputTokens: Math.ceil(chars / 4) }];
  }));
  return { metrics: scoreRankings(questions, rankings), owed: null };
}

export interface LoreRerankCase {
  id: string;
  query: string;
  candidates: Array<{ key: string; text: string }>;
  labels: Record<string, LoreRelevance>;
}

export const rerankLoreTurns = (cases: readonly LoreRerankCase[], recorded: RecordedRerank): LoreRankTurn[] => cases.flatMap((entry) => {
  const scores = recorded[entry.id]?.scores;
  if (!scores || scores.length !== entry.candidates.length) return [];
  const ranked = entry.candidates.map((candidate, index) => ({ key: candidate.key, score: scores[index] as number, index }))
    .sort((left, right) => right.score - left.score || left.index - right.index).map(({ key, score }) => ({ key, score }));
  return [{ id: entry.id, ranked, considered: entry.candidates.map((candidate) => candidate.key), labels: entry.labels }];
});

export interface RerankItem {
  id: string;
  query: string;
  documents: string[];
}

export interface RerankRecording {
  recorded: RecordedRerank;
  failures: Array<{ id: string; reason: string }>;
}

export async function recordRerank(client: ReturnType<typeof createRerankClient>, items: readonly RerankItem[]): Promise<RerankRecording> {
  const recorded: RecordedRerank = {};
  const failures: Array<{ id: string; reason: string }> = [];
  for (const item of items) {
    const result = await client(item.query, item.documents);
    if (!result.ok) {
      failures.push({ id: item.id, reason: result.reason });
      continue;
    }
    const scores = item.documents.map(() => Number.NEGATIVE_INFINITY);
    for (const score of result.scores) scores[score.index] = score.score;
    recorded[item.id] = { scores, latencyMs: result.latencyMs };
  }
  return { recorded, failures };
}

import { fnv1a } from "@runtime/hash";
import { isRecord } from "@utils/guards";
import { E0_BAND_THRESHOLDS, E0_POOL_SIZE, E0_PROTECT, type E0Candidate, type E0PoolQuestion } from "./e0Ranking";

export const E0_LABELS_FORMAT = "so-e0-labels/1";
export const E0_POOL_FORMAT = "so-e0-pool/1";

export interface E0ChatRow {
  id: number;
  name: string;
  isUser: boolean;
  isSystem?: boolean;
  text: string;
}

export interface E0Review {
  writer: string;
  checker: string;
  agreed: boolean;
}

export interface E0LabelQuestion {
  id: string;
  session: string;
  askMessageId: number;
  asker: string;
  text: string;
  gold: number[];
  review: E0Review | null;
}

export interface E0LabelSet {
  format: typeof E0_LABELS_FORMAT;
  source: "synthetic" | "private";
  questions: E0LabelQuestion[];
}

export interface E0Pool {
  format: typeof E0_POOL_FORMAT;
  source: E0LabelSet["source"];
  provider: string;
  topK: number;
  threshold: number;
  protect: number;
  bandThresholds: number[];
  questions: E0PoolQuestion[];
  refused: Array<{ id: string; reason: string }>;
}

export interface E0VectorItem {
  id: number;
  text: string;
}

export interface E0Timed {
  ids: number[];
  latencyMs: number;
}

export interface E0VectorProvider {
  id: string;
  query(collection: readonly E0VectorItem[], text: string, topK: number, threshold: number): Promise<number[] | E0Timed>;
}

const timed = (answer: number[] | E0Timed): { ids: number[]; latencyMs: number | null } =>
  (Array.isArray(answer) ? { ids: answer, latencyMs: null } : { ids: answer.ids, latencyMs: answer.latencyMs });

export interface E0LabelRead {
  source: E0LabelSet["source"];
  questions: E0LabelQuestion[];
  dropped: { disagreed: number; invalid: Array<{ id: string; reason: string }> };
}

const labelProblem = (question: E0LabelQuestion, source: E0LabelSet["source"]): string | null => {
  if (!question.text.trim()) return "empty question";
  if (question.gold.length < 1 || question.gold.length > 2) return `gold holds ${question.gold.length} ids, 1-2 allowed`;
  if (question.gold.some((id) => id >= question.askMessageId)) return "gold at or after the asking turn";
  if (source === "synthetic") return null;
  if (!question.review) return "private label without a review";
  if (!question.review.writer || question.review.writer === question.review.checker) return "writer and checker must be two different models";
  return null;
};

const asQuestion = (raw: unknown): E0LabelQuestion | null => {
  if (!isRecord(raw)) return null;
  const { id, session, askMessageId, asker, text, gold, review } = raw;
  if (typeof id !== "string" || typeof session !== "string" || typeof askMessageId !== "number" || typeof text !== "string") return null;
  if (!Array.isArray(gold) || !gold.every((entry) => typeof entry === "number")) return null;
  const reviewed = isRecord(review) && typeof review.writer === "string" && typeof review.checker === "string" && typeof review.agreed === "boolean"
    ? { writer: review.writer, checker: review.checker, agreed: review.agreed } : null;
  return { id, session, askMessageId, asker: typeof asker === "string" ? asker : "", text, gold, review: reviewed };
};

export function readE0Labels(raw: unknown): E0LabelRead {
  if (!isRecord(raw) || raw.format !== E0_LABELS_FORMAT) throw new Error(`labels: format must be ${E0_LABELS_FORMAT}`);
  const source = raw.source === "private" ? "private" : raw.source === "synthetic" ? "synthetic" : null;
  if (!source) throw new Error("labels: source must be synthetic or private");
  const rows = Array.isArray(raw.questions) ? raw.questions : [];
  const questions: E0LabelQuestion[] = [];
  const invalid: Array<{ id: string; reason: string }> = [];
  let disagreed = 0;
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const question = asQuestion(row);
    if (!question) return invalid.push({ id: `#${index}`, reason: "malformed label" });
    const problem = seen.has(question.id) ? "duplicate id" : labelProblem(question, source);
    seen.add(question.id);
    if (problem) return invalid.push({ id: question.id, reason: problem });
    if (source === "private" && question.review?.agreed === false) disagreed += 1;
    else questions.push(question);
    return undefined;
  });
  return { source, questions, dropped: { disagreed, invalid } };
}

export function readE0Chat(raw: unknown): E0ChatRow[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.flatMap((row) => (isRecord(row) && typeof row.id === "number" && typeof row.text === "string"
    ? [{ id: row.id, name: typeof row.name === "string" ? row.name : "", isUser: row.isUser === true, isSystem: row.isSystem === true, text: row.text }]
    : []));
}

export function e0Collection(rows: readonly E0ChatRow[], askMessageId: number): E0VectorItem[] {
  const before = rows.filter((row) => row.id < askMessageId && !row.isSystem && row.text.trim());
  return before.slice(0, Math.max(0, before.length - E0_PROTECT)).map((row) => ({ id: row.id, text: row.text }));
}

export function e0Query(rows: readonly E0ChatRow[], question: E0LabelQuestion): string {
  const previous = rows.filter((row) => row.id < question.askMessageId && !row.isSystem && row.text.trim()).at(-1);
  return [previous?.text ?? "", question.text].filter(Boolean).join("\n");
}

async function poolQuestion(question: E0LabelQuestion, rows: readonly E0ChatRow[], provider: E0VectorProvider): Promise<E0PoolQuestion | string> {
  const collection = e0Collection(rows, question.askMessageId);
  if (collection.length < E0_POOL_SIZE) return `collection holds ${collection.length} messages, under ${E0_POOL_SIZE}`;
  const query = e0Query(rows, question);
  const pooled = timed(await provider.query(collection, query, E0_POOL_SIZE, 0));
  const ids = pooled.ids;
  if (ids.length !== E0_POOL_SIZE) return `pool query returned ${ids.length} ids`;
  const bands = new Map<number, Set<number>>();
  const bandLatency: Record<string, number> = {};
  let latencyKnown = pooled.latencyMs !== null;
  for (const band of E0_BAND_THRESHOLDS) {
    const answer = timed(await provider.query(collection, query, E0_POOL_SIZE, band));
    bands.set(band, new Set(answer.ids));
    if (answer.latencyMs === null) latencyKnown = false;
    else bandLatency[String(band)] = answer.latencyMs;
  }
  const text = new Map(collection.map((item) => [item.id, item.text]));
  const candidates: E0Candidate[] = ids.map((id, stRank) => ({
    messageId: id,
    textHash: fnv1a(text.get(id) ?? ""),
    text: text.get(id) ?? "",
    stRank,
    bands: E0_BAND_THRESHOLDS.filter((band) => bands.get(band)?.has(id)),
  }));
  const latencyMs = latencyKnown && pooled.latencyMs !== null ? { latencyMs: { pool: pooled.latencyMs, bands: bandLatency } } : {};
  return { id: question.id, askMessageId: question.askMessageId, query, gold: question.gold, candidates, ...latencyMs };
}

export async function buildE0Pool(labels: E0LabelRead, chats: ReadonlyMap<string, readonly E0ChatRow[]>, provider: E0VectorProvider): Promise<E0Pool> {
  const questions: E0PoolQuestion[] = [];
  const refused: Array<{ id: string; reason: string }> = [];
  for (const question of labels.questions) {
    const rows = chats.get(question.session);
    const built = rows ? await poolQuestion(question, rows, provider) : `no chat for session ${question.session}`;
    if (typeof built === "string") refused.push({ id: question.id, reason: built });
    else questions.push(built);
  }
  return {
    format: E0_POOL_FORMAT, source: labels.source, provider: provider.id, topK: E0_POOL_SIZE, threshold: 0, protect: E0_PROTECT,
    bandThresholds: [...E0_BAND_THRESHOLDS], questions, refused,
  };
}

const STUB_DIMENSIONS = 256;

const trigramVector = (text: string): number[] => {
  const vector = new Array<number>(STUB_DIMENSIONS).fill(0);
  const padded = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  for (let index = 0; index + 3 <= padded.length; index += 1) vector[parseInt(fnv1a(padded.slice(index, index + 3)), 16) % STUB_DIMENSIONS] += 1;
  return vector;
};

const cosine = (left: number[], right: number[]): number => {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
};

export const e0StubSimilarity = (left: string, right: string): number => cosine(trigramVector(left), trigramVector(right));

export const e0StubProvider: E0VectorProvider = {
  id: `stub-trigram-${STUB_DIMENSIONS}`,
  query: async (collection, text, topK, threshold) => collection
    .map((item) => ({ id: item.id, score: e0StubSimilarity(text, item.text) }))
    .filter((item) => item.score >= threshold)
    .sort((left, right) => right.score - left.score || left.id - right.id)
    .slice(0, topK)
    .map((item) => item.id),
};

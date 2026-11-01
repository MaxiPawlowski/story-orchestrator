import { jaccardSimilarity } from "./similarity";
import { lastUseBoundary } from "./strength";
import type { MemoryEntry, MemoryExpiration } from "./types";
import { contentWords, restatesWords } from "./words";

export interface ScoreWeights {
  importance: number;
  durability: number;
  confidence: number;
  recallCount: number;
  recency: number;
  entityOverlap: number;
  semanticSimilarity: number;
  temporalProximity: number;
  activation: number;
  arcRelevance: number;
  contradiction: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  importance: 1.5,
  durability: 1,
  confidence: 0.8,
  recallCount: 0.6,
  recency: 1.2,
  entityOverlap: 1.5,
  semanticSimilarity: 1.3,
  temporalProximity: 0.5,
  activation: 1,
  arcRelevance: 1,
  contradiction: 2,
};

export interface QueryPart {
  text: string;
  weight: number;
}

export interface EvidenceRow {
  text: string;
  age: number;
}

export interface ScoreContext {
  boundary: number;
  lastMessageId?: number;
  turnText: string;
  turnEntities: string[];
  openArcs?: string[];
  weights?: Partial<ScoreWeights>;
  queryParts?: QueryPart[];
  evidence?: { rows: EvidenceRow[]; cast: string[] };
  useRecency?: boolean;
  normalise?: boolean;
}

export type ScoreTerms = Record<keyof ScoreWeights, number>;

export const QUERY_WINDOW = 4;
export const EVIDENCE_WINDOW = 40;
export const RECENCY_SCALE = 12;

const DURABILITY: Record<MemoryExpiration, number> = { permanent: 1, session: 0.5, scene: 0.2 };

const lower = (value: string) => value.trim().toLowerCase();

const termIn = (text: string, term: string): boolean => {
  const needle = lower(term);
  if (needle.length < 3) return false;
  let at = text.indexOf(needle);
  while (at >= 0) {
    if (!/[\p{L}\p{N}]/u.test(text.charAt(at - 1)) && !/[\p{L}\p{N}]/u.test(text.charAt(at + needle.length))) return true;
    at = text.indexOf(needle, at + 1);
  }
  return false;
};

export function recencyWeights(count: number): number[] {
  const total = (count * (count + 1)) / 2;
  return Array.from({ length: count }, (_, index) => (index + 1) / total);
}

export function evidenceAge(entry: MemoryEntry, evidence: NonNullable<ScoreContext["evidence"]>): number | null {
  const cast = new Set(evidence.cast.map(lower));
  const terms = [...entry.entities, ...entry.activationTriggers, ...(entry.keys ?? [])].filter((term) => term && !cast.has(lower(term)));
  const words = contentWords(entry.text);
  cast.forEach((name) => contentWords(name).forEach((word) => words.delete(word)));
  for (const row of evidence.rows) {
    const text = row.text.toLowerCase();
    if (terms.some((term) => termIn(text, term)) || restatesWords(words, contentWords(row.text))) return row.age;
  }
  return null;
}

export function scoreTerms(entry: MemoryEntry, context: ScoreContext): ScoreTerms {
  const turnText = lower(context.turnText);
  const turnEntities = new Set(context.turnEntities.map(lower));
  const parts = context.queryParts?.length ? context.queryParts.map((part) => ({ text: lower(part.text), weight: part.weight })) : null;

  const importance = (entry.importance - 1) / 2;
  const durability = DURABILITY[entry.expiration];
  const confidence = Math.max(0, Math.min(1, entry.confidence));
  const recallCount = Math.min(1, (entry.recallCount + (context.useRecency ? (entry.usedAt?.length ?? 0) : 0)) / 5);

  let age = Math.max(0, context.boundary - (context.useRecency ? lastUseBoundary(entry) : entry.createdAt));
  if (context.evidence) {
    const seen = evidenceAge(entry, context.evidence);
    if (seen !== null) age = Math.min(age, seen);
  }
  const recency = 1 / (1 + age / RECENCY_SCALE);

  const entities = entry.entities.map(lower).filter(Boolean);
  const overlap = entities.length ? entities.filter((entity) => turnEntities.has(entity)).length / entities.length : 0;

  const semanticSimilarity = parts
    ? parts.reduce((sum, part) => sum + (part.text ? part.weight * jaccardSimilarity(entry.text, part.text) : 0), 0)
    : turnText ? jaccardSimilarity(entry.text, turnText) : 0;

  let temporalProximity = 0.5;
  if (typeof entry.messageId === "number" && typeof context.lastMessageId === "number") {
    const distance = Math.max(0, context.lastMessageId - entry.messageId);
    temporalProximity = 1 / (1 + distance / 20);
  }

  const texts = parts ? parts.map((part) => part.text) : [turnText];
  const keyed = (entry.keys ?? []).some((key) => key.length >= 3 && texts.some((text) => termIn(text, lower(key))));
  const activation = keyed || entry.activationTriggers.some((trigger) => trigger && texts.some((text) => text.includes(lower(trigger)))) ? 1 : 0;
  const contradiction = entry.contradicted ? 1 : 0;

  const openArcs = context.openArcs ?? [];
  const arcRelevance = openArcs.length ? Math.max(...openArcs.map((arc) => jaccardSimilarity(entry.text, arc))) : 0;

  return {
    importance, durability, confidence, recallCount, recency, entityOverlap: overlap, semanticSimilarity, temporalProximity, activation, arcRelevance, contradiction,
  };
}

const TERM_KEYS = Object.keys(DEFAULT_SCORE_WEIGHTS) as Array<keyof ScoreWeights>;

export function combineTerms(terms: ScoreTerms, weights: Partial<ScoreWeights> = {}): number {
  const merged = { ...DEFAULT_SCORE_WEIGHTS, ...weights };
  return TERM_KEYS.reduce((sum, key) => sum + (key === "contradiction" ? -1 : 1) * merged[key] * terms[key], 0);
}

export function scoreEntry(entry: MemoryEntry, context: ScoreContext): number {
  return combineTerms(scoreTerms(entry, context), context.weights);
}

export function normaliseTerms(terms: readonly ScoreTerms[]): ScoreTerms[] {
  const ranges = TERM_KEYS.map((key) => {
    const values = terms.map((term) => term[key]);
    return { key, min: Math.min(...values), max: Math.max(...values) };
  });
  return terms.map((term) => Object.fromEntries(ranges.map(({ key, min, max }) => [key, max > min ? (term[key] - min) / (max - min) : 0])) as ScoreTerms);
}

export function scoreAll(entries: readonly MemoryEntry[], context: ScoreContext): Map<string, number> {
  const terms = entries.map((entry) => scoreTerms(entry, context));
  const used = context.normalise && entries.length > 1 ? normaliseTerms(terms) : terms;
  return new Map(entries.map((entry, index) => [entry.id, combineTerms(used[index], context.weights)]));
}

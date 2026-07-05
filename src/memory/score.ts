import { jaccardSimilarity } from "./similarity";
import type { MemoryEntry, MemoryExpiration } from "./types";

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
  arcRelevance: 0,
  contradiction: 2,
};

export interface ScoreContext {
  boundary: number;
  lastMessageId?: number;
  turnText: string;
  turnEntities: string[];
  weights?: Partial<ScoreWeights>;
}

const DURABILITY: Record<MemoryExpiration, number> = { permanent: 1, session: 0.5, scene: 0.2 };

const lower = (value: string) => value.trim().toLowerCase();

export function scoreEntry(entry: MemoryEntry, context: ScoreContext): number {
  const weights = { ...DEFAULT_SCORE_WEIGHTS, ...context.weights };
  const turnText = lower(context.turnText);
  const turnEntities = new Set(context.turnEntities.map(lower));

  const importance = (entry.importance - 1) / 2;
  const durability = DURABILITY[entry.expiration];
  const confidence = Math.max(0, Math.min(1, entry.confidence));
  const recallCount = Math.min(1, entry.recallCount / 5);

  const age = Math.max(0, context.boundary - entry.createdAt);
  const recency = 1 / (1 + age / 12);

  const entities = entry.entities.map(lower).filter(Boolean);
  const overlap = entities.length ? entities.filter((entity) => turnEntities.has(entity)).length / entities.length : 0;

  const semanticSimilarity = turnText ? jaccardSimilarity(entry.text, turnText) : 0;

  let temporalProximity = 0.5;
  if (typeof entry.messageId === "number" && typeof context.lastMessageId === "number") {
    const distance = Math.max(0, context.lastMessageId - entry.messageId);
    temporalProximity = 1 / (1 + distance / 20);
  }

  const activation = entry.activationTriggers.some((trigger) => trigger && turnText.includes(lower(trigger))) ? 1 : 0;
  const contradiction = entry.contradicted ? 1 : 0;

  return (
    weights.importance * importance +
    weights.durability * durability +
    weights.confidence * confidence +
    weights.recallCount * recallCount +
    weights.recency * recency +
    weights.entityOverlap * overlap +
    weights.semanticSimilarity * semanticSimilarity +
    weights.temporalProximity * temporalProximity +
    weights.activation * activation -
    weights.contradiction * contradiction
  );
}

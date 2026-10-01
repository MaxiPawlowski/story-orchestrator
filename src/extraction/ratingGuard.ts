import type { PrimitiveValue, Quality, QualityRatingLevel } from "@engine/index";
import type { ParsedDelta } from "./types";

export interface HeldRatingDelta {
  key: string;
  value: string;
  evidence: string;
  reason: string;
}

export interface RatingGuardResult {
  accepted: ParsedDelta[];
  held: HeldRatingDelta[];
}

const authoredLevels = (quality: Quality | undefined): QualityRatingLevel[] | null => {
  if (!quality?.monotonic || quality.read_as !== "rating") return null;
  const criteria = quality.criteria;
  return criteria && "levels" in criteria && Array.isArray(criteria.levels) && criteria.levels.length >= 2 ? criteria.levels : null;
};

const levelName = (level: QualityRatingLevel) => level.label.split(":")[0].trim();

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const names = (evidence: string, name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(name)}($|[^\\p{L}\\p{N}])`, "iu").test(evidence);

const refusal = (levels: QualityRatingLevel[], value: PrimitiveValue, current: PrimitiveValue | undefined, evidence: string): string | null => {
  const level = levels.find((entry) => entry.value === value);
  if (!level || typeof value !== "number") return null;
  if (!names(evidence, levelName(level))) return `the evidence never names ${levelName(level)}`;
  if (typeof current !== "number") return null;
  const next = levels.map((entry) => entry.value).filter((entry) => entry > current).sort((left, right) => left - right)[0];
  return next !== undefined && value > next ? `skips from ${current} past the next level` : null;
};

export const applyRatingGrounding = (
  qualityByKey: Record<string, Quality>,
  values: Record<string, PrimitiveValue>,
  deltas: ParsedDelta[],
): RatingGuardResult => {
  const accepted: ParsedDelta[] = [];
  const held: HeldRatingDelta[] = [];
  for (const delta of deltas) {
    const levels = authoredLevels(qualityByKey[delta.delta.q]);
    const reason = levels ? refusal(levels, delta.delta.v, values[delta.delta.q], delta.evidence ?? "") : null;
    if (reason) held.push({ key: delta.delta.q, value: String(delta.delta.v), evidence: delta.evidence ?? "", reason });
    else accepted.push(delta);
  }
  return { accepted, held };
};

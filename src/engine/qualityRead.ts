import type { Quality, QualityRatingLevel } from "./schema";

export const QUALITY_READ_AS = ["choice", "stated", "rating"] as const;

export const READ_AS_TYPES: Record<(typeof QUALITY_READ_AS)[number], ReadonlyArray<Quality["type"]>> = {
  choice: ["bool", "enum"],
  stated: ["int", "float", "string"],
  rating: ["int", "float"],
};

// v2.2 plan 06: a rating's levels come from authored `criteria.levels`, or from a rubric that
// reads "from N (low) to M (high)" with at most 10 steps (spike experiments/extraction.mts).
export function ratingLevels(quality: Pick<Quality, "rubric" | "criteria">): QualityRatingLevel[] | null {
  if (quality.criteria && "levels" in quality.criteria && Array.isArray(quality.criteria.levels) && quality.criteria.levels.length >= 2) return quality.criteria.levels;
  const match = quality.rubric.match(/from\s+(-?\d+)\s*\(([^)]+)\)\s*to\s+(-?\d+)\s*\(([^)]+)\)/i);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[3]);
  if (max - min < 1 || max - min + 1 > 10) return null;
  return Array.from({ length: max - min + 1 }, (_, index) => {
    const value = min + index;
    return { value, label: value === min ? `${value}: ${match[2]}` : value === max ? `${value}: ${match[4]}` : String(value) };
  });
}

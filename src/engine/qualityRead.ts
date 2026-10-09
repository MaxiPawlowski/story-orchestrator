import type { PrimitiveValue, Quality, QualityRatingLevel, QualityStepRule } from "./schema";

export const QUALITY_READ_AS = ["choice", "stated", "rating"] as const;

export const READ_AS_TYPES: Record<(typeof QUALITY_READ_AS)[number], ReadonlyArray<Quality["type"]>> = {
  choice: ["bool", "enum"],
  stated: ["int", "float", "string"],
  rating: ["int", "float"],
};

// A rating's levels come from authored `criteria.levels`, or from a rubric that
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

export const STEP_WORDS = { up: 1, down: -1 } as const;

export type StepWord = keyof typeof STEP_WORDS;

export const readsByStep = (quality: Pick<Quality, "type" | "step_rule">): quality is Pick<Quality, "type"> & { step_rule: QualityStepRule } =>
  quality.type === "int" && Boolean(quality.step_rule) && !quality.step_rule?.cycle && (quality.step_rule?.step ?? 0) > 0;

export const stepWord = (value: PrimitiveValue | undefined): StepWord | null => {
  if (typeof value !== "string") return null;
  const word = value.trim().toLowerCase();
  return word === "up" || word === "down" ? word : null;
};

export const resolveStep = (rule: QualityStepRule, word: StepWord, current: PrimitiveValue | undefined): number => {
  const from = typeof current === "number" ? current : rule.start ?? 0;
  const moved = from + STEP_WORDS[word] * rule.step;
  return Math.max(rule.min ?? moved, Math.min(rule.max ?? moved, moved));
};

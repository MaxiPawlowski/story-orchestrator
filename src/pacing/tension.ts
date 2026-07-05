import { TENSION_LEVELS, type TensionLevel } from "@engine/index";

export const TENSION_NUMERIC: Record<TensionLevel, number> = {
  calm: 0,
  stirring: 0.25,
  tense: 0.5,
  critical: 0.75,
  peak: 1,
};

export const isTensionLevel = (value: unknown): value is TensionLevel =>
  typeof value === "string" && (TENSION_LEVELS as readonly string[]).includes(value);

export const levelToNumeric = (level: TensionLevel): number => TENSION_NUMERIC[level];

export const numericToLevel = (value: number): TensionLevel =>
  TENSION_LEVELS.reduce((closest, level) =>
    Math.abs(TENSION_NUMERIC[level] - value) < Math.abs(TENSION_NUMERIC[closest] - value) ? level : closest,
  TENSION_LEVELS[0]);

export const updateEma = (prevSmoothed: number | null, sample: number, alpha: number): number => {
  if (prevSmoothed === null) return sample;
  const a = Math.min(1, Math.max(0, alpha));
  return a * sample + (1 - a) * prevSmoothed;
};

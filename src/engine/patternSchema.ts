export const PATTERN_KINDS = ["transition", "quest", "milestone", "check"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const PATTERNS_MAX = 16;
export const PATTERN_STEPS_MAX = 3;
export const PATTERN_VARS_MAX = 2;
export const PATTERN_UNLESS_MAX = 4;
export const PATTERN_TEXT_MAX = 240;
export const PATTERN_WITHIN_MAX = 200;
export const PATTERN_BRANCH_CAP = 16;
export const PATTERN_HINT_BOUNDARIES = 3;
export const PATTERN_REPEATS = ["once", "each"] as const;
export type PatternRepeat = (typeof PATTERN_REPEATS)[number];

export const PATTERN_ATTRS = {
  transition: ["to", "from", "chapter"],
  quest: ["id", "to", "giver"],
  milestone: ["id"],
  check: ["id", "outcome", "quality"],
} as const satisfies Record<PatternKind, readonly string[]>;

export const PATTERN_QUEST_STATUSES = ["offered", "active", "done", "failed"] as const;
export const PATTERN_CHECK_OUTCOMES = ["success", "failure", "miss", "weak", "strong"] as const;
export const PATTERN_VAR = /^\?[a-z][a-z0-9_]{0,31}$/;
export const PATTERN_CAUSE_WORDS = /\b(because|so that|therefore|led to)\b/i;

export interface PatternStep {
  kind: PatternKind;
  id?: string;
  to?: string;
  where?: Record<string, string>;
}

export interface PatternUnless extends PatternStep {
  between: [number, number];
}

export interface StoryPattern {
  id: string;
  steps: PatternStep[];
  unless?: PatternUnless[];
  within?: number;
  repeat?: PatternRepeat;
  label?: { text: string };
  hint?: string;
  pending?: string;
}

declare module "./schema" {
  interface Story {
    patterns?: StoryPattern[];
  }
}

export const isPatternVar = (value: string): boolean => PATTERN_VAR.test(value);

export const stepConditions = (step: PatternStep): Record<string, string> => {
  const conditions: Record<string, string> = { ...(step.where ?? {}) };
  if (step.id !== undefined) conditions.id = step.id;
  if (step.to !== undefined) conditions[step.kind === "check" ? "outcome" : "to"] = step.to;
  return conditions;
};

export const patternVars = (pattern: Pick<StoryPattern, "steps" | "unless">): string[] =>
  [...new Set([...pattern.steps, ...(pattern.unless ?? [])].flatMap((step) => Object.values(stepConditions(step)).filter(isPatternVar)))];

export const patternTexts = (pattern: Pick<StoryPattern, "label" | "hint" | "pending">): Array<{ field: "label" | "hint" | "pending"; text: string }> => [
  ...(pattern.label?.text ? [{ field: "label" as const, text: pattern.label.text }] : []),
  ...(pattern.hint ? [{ field: "hint" as const, text: pattern.hint }] : []),
  ...(pattern.pending ? [{ field: "pending" as const, text: pattern.pending }] : []),
];

export const REASONING_EFFORTS = ["default", "off", "low", "medium", "high"] as const;

export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export type ReasoningLevel = "low" | "medium" | "high";

export const REASONING_LEVELS: readonly ReasoningLevel[] = ["low", "medium", "high"];

export type ReasoningBudget = Record<ReasoningLevel, number>;

export const DEFAULT_REASONING_BUDGET: ReasoningBudget = { low: 512, medium: 2048, high: 6144 };

export const REASONING_BUDGET_MAX = 32768;

export const isReasoningEffort = (value: unknown): value is ReasoningEffort => typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);

export const isReasoningLevel = (effort: ReasoningEffort): effort is ReasoningLevel => effort === "low" || effort === "medium" || effort === "high";

export const reasoningBudgetFor = (effort: ReasoningEffort, budget: ReasoningBudget | undefined): number =>
  isReasoningLevel(effort) ? (budget ?? DEFAULT_REASONING_BUDGET)[effort] : 0;

export const sanitizeReasoningBudget = (value: unknown): ReasoningBudget | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const level = (key: ReasoningLevel): number => {
    const raw = source[key];
    return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= REASONING_BUDGET_MAX ? raw : DEFAULT_REASONING_BUDGET[key];
  };
  return { low: level("low"), medium: level("medium"), high: level("high") };
};

export const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  default: "As the profile sets it",
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export interface ReasoningSpend {
  chars: number;
  tokens: number | null;
}

export const reasoningExhaustedMessage = (spend: ReasoningSpend, finish: string): string =>
  `the model spent its whole budget thinking and gave no answer (${spend.chars} reasoning chars${spend.tokens !== null ? `, ${spend.tokens} reasoning tokens` : ""}, finish ${finish})`;

export const isReasoningExhausted = (text: string, finish: string, spend: ReasoningSpend): boolean =>
  text.trim() === "" && (spend.chars > 0 || (spend.tokens ?? 0) > 0 || finish === "length");

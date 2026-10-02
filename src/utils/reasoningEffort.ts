export const REASONING_EFFORTS = ["default", "off", "low", "medium", "high"] as const;

export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export type ReasoningLevel = "low" | "medium" | "high";

export type ReasoningBudget = Record<ReasoningLevel, number>;

export type ReplyEffort = "off" | "low" | "medium" | "high";

export const isReplyEffort = (value: unknown): value is ReplyEffort => /^(off|low|medium|high)$/.test(String(value));

export const DEFAULT_REASONING_BUDGET: ReasoningBudget = { low: 512, medium: 2048, high: 6144 };

const REASONING_BUDGET_MAX = 32768;

export const isReasoningEffort = (value: unknown): value is ReasoningEffort => REASONING_EFFORTS.includes(value as ReasoningEffort);

export const reasoningBudgetFor = (effort: ReasoningEffort, budget: ReasoningBudget = DEFAULT_REASONING_BUDGET): number =>
  (budget as Partial<Record<ReasoningEffort, number>>)[effort] ?? 0;

const budgetLevel = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= REASONING_BUDGET_MAX;

export const sanitizeReasoningBudget = (value: unknown): ReasoningBudget | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const pick = (level: ReasoningLevel): number => {
    const raw = source[level];
    return budgetLevel(raw) ? raw : DEFAULT_REASONING_BUDGET[level];
  };
  return { low: pick("low"), medium: pick("medium"), high: pick("high") };
};

export const effortLabel = (effort: ReasoningEffort): string => (effort === "default" ? "As the profile sets it" : effort[0].toUpperCase() + effort.slice(1));

export interface ReasoningSpend {
  chars: number;
  tokens: number | null;
}

export const reasoningExhaustedMessage = (spend: ReasoningSpend, finish: string): string =>
  `the model spent its whole budget thinking (${spend.chars} chars${spend.tokens === null ? "" : `, ${spend.tokens} tokens`}, finish ${finish})`;

export const isReasoningExhausted = (text: string, finish: string, spend: ReasoningSpend): boolean =>
  !text.trim() && (spend.chars > 0 || Number(spend.tokens) > 0 || finish === "length");

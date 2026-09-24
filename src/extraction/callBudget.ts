export const CALL_TIMEOUT_BASE_MS = 30000;
export const CALL_TIMEOUT_MS_PER_TOKEN = 50;
export const DEFAULT_MAX_TOKENS = 512;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export const callTimeoutMs = (maxTokens: number): number => CALL_TIMEOUT_BASE_MS + Math.max(0, Math.ceil(maxTokens)) * CALL_TIMEOUT_MS_PER_TOKEN;

export type PassFamily = "sharedRead" | "sceneSummary" | "shortTerm" | "arcSummary" | "canon" | "epistemic" | "ledger" | "curator";

export type ResponseBudget = { fixed: number } | { ratio: number; floor: number; cap: number };

export const MAX_TOKENS_TABLE: Record<PassFamily, ResponseBudget> = {
  sharedRead: { fixed: DEFAULT_MAX_TOKENS },
  sceneSummary: { ratio: 0.25, floor: 256, cap: 1024 },
  shortTerm: { ratio: 0.25, floor: 256, cap: 1024 },
  arcSummary: { ratio: 0.25, floor: 256, cap: 1024 },
  canon: { ratio: 0.25, floor: 768, cap: 1536 },
  epistemic: { ratio: 0.25, floor: 384, cap: 1024 },
  ledger: { ratio: 0.25, floor: 384, cap: 1024 },
  curator: { ratio: 0.25, floor: 384, cap: 1024 },
};

export function maxTokensFor(family: PassFamily, inputTokens: number): number {
  const budget = MAX_TOKENS_TABLE[family];
  if ("fixed" in budget) return budget.fixed;
  const wanted = Math.ceil(Math.max(0, inputTokens) * budget.ratio);
  return Math.min(budget.cap, Math.max(budget.floor, wanted));
}

export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);

export const maxTokensForInput = (family: PassFamily, input: string): number => maxTokensFor(family, estimateTokens(input));

export const maxTokensCap = (family: PassFamily): number => {
  const budget = MAX_TOKENS_TABLE[family];
  return "fixed" in budget ? budget.fixed : budget.cap;
};

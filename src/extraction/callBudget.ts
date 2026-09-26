export const CALL_TIMEOUT_BASE_MS = 30000;
export const CALL_TIMEOUT_MS_PER_TOKEN = 50;
export const DEFAULT_MAX_TOKENS = 512;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export const CALL_TIMEOUT_MS_PER_INPUT_TOKEN = 2;
export const TIMEOUT_RETRY_SCALE = 2;

export const debugCallBudgetScale = (): number => {
  const scale: unknown = Reflect.get(globalThis, "storyOrchestratorDebugCallBudgetScale");
  return typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 1;
};

export const callTimeoutMs = (maxTokens: number, inputTokens = 0): number =>
  Math.round((CALL_TIMEOUT_BASE_MS + Math.max(0, Math.ceil(maxTokens)) * CALL_TIMEOUT_MS_PER_TOKEN + Math.max(0, Math.ceil(inputTokens)) * CALL_TIMEOUT_MS_PER_INPUT_TOKEN) * debugCallBudgetScale());

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

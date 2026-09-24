export const DEFAULT_CONTEXT_LIMIT = 8192;
export const INPUT_BUDGET_MARGIN = 0.1;
export const TRUNCATION_MARKER = "[…message truncated to fit the memory model's context]";

export type ContextLimitSource = "preset" | "default";

export interface ContextLimit {
  value: number;
  source: ContextLimitSource;
  reason?: string;
}

export interface InputBudget {
  contextLimit: ContextLimit;
  maxTokens: number;
  margin: number;
  input: number;
}

export type TokenCounter = (text: string) => number;

export interface BudgetMessage {
  messageId: number;
  text: string;
}

export interface FitOptions {
  budget: number;
  promptOverhead: number;
  count: TokenCounter;
  perMessage?: number;
  maxMessages?: number;
}

export interface FitWindow<T extends BudgetMessage> {
  from: number;
  to: number;
  messages: T[];
}

export type TailFit<T extends BudgetMessage> =
  | (FitWindow<T> & { ok: true; tokens: number; trimmedFrom: number | null; truncated: number[] })
  | { ok: false; capacity: number; reason: string };

export const defaultContextLimit = (reason: string): ContextLimit => ({ value: DEFAULT_CONTEXT_LIMIT, source: "default", reason });

export const usableContextLimit = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null);

export function inputBudget(contextLimit: ContextLimit, maxTokens: number): InputBudget {
  const limit = usableContextLimit(contextLimit.value) ?? DEFAULT_CONTEXT_LIMIT;
  const reply = Math.max(0, Math.ceil(Number.isFinite(maxTokens) ? maxTokens : 0));
  const margin = Math.ceil(limit * INPUT_BUDGET_MARGIN);
  return { contextLimit, maxTokens: reply, margin, input: Math.max(0, limit - reply - margin) };
}

export const capacityOf = (options: FitOptions): number => Math.floor(options.budget - options.promptOverhead);

export const messageCost = (text: string, options: FitOptions): number => options.count(text) + (options.perMessage ?? 0);

export function markerRefusal(options: FitOptions): string | null {
  const capacity = capacityOf(options);
  if (capacity <= 0) return `the prompt leaves no room for messages (budget ${options.budget}, prompt ${options.promptOverhead})`;
  const marker = messageCost(TRUNCATION_MARKER, options);
  return marker > capacity ? `the room left for messages (${capacity}) is smaller than a truncated message (${marker})` : null;
}

export function truncateToFit(text: string, capacity: number, options: FitOptions): string {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (messageCost(`${text.slice(0, middle)} ${TRUNCATION_MARKER}`, options) <= capacity) low = middle;
    else high = middle - 1;
  }
  const kept = `${text.slice(0, low).trimEnd()} ${TRUNCATION_MARKER}`.trimStart();
  return messageCost(kept, options) <= capacity ? kept : TRUNCATION_MARKER;
}

export function tailFit<T extends BudgetMessage>(window: FitWindow<T>, options: FitOptions): TailFit<T> {
  const capacity = capacityOf(options);
  const refusal = markerRefusal(options);
  if (refusal) return { ok: false, capacity, reason: refusal };
  const kept: T[] = [];
  const truncated: number[] = [];
  let tokens = 0;
  for (let index = window.messages.length - 1; index >= 0; index -= 1) {
    const message = window.messages[index];
    const cost = messageCost(message.text, options);
    if (tokens + cost <= capacity) {
      kept.unshift(message);
      tokens += cost;
      continue;
    }
    if (kept.length === 0) {
      const text = truncateToFit(message.text, capacity, options);
      kept.unshift({ ...message, text });
      tokens += messageCost(text, options);
      truncated.push(message.messageId);
    }
    break;
  }
  const trimmed = kept.length < window.messages.length;
  return {
    ok: true,
    from: trimmed ? kept[0].messageId : window.from,
    to: window.to,
    messages: kept,
    tokens,
    trimmedFrom: trimmed ? window.from : null,
    truncated,
  };
}

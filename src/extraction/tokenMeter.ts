import { estimateTokens } from "./callBudget";
import type { ContextLimit, TokenCounter } from "./inputBudget";

export type CountTokensAsync = (text: string) => Promise<number>;

export interface TokenMeter {
  count: TokenCounter;
  prime(texts: readonly string[]): Promise<void>;
}

export interface RequestBudget {
  contextLimit: ContextLimit;
  meter: TokenMeter;
}

export function createTokenMeter(countAsync?: CountTokensAsync): TokenMeter {
  const counted = new Map<string, number>();
  return {
    count: (text) => counted.get(text) ?? estimateTokens(text),
    async prime(texts) {
      if (!countAsync) return;
      for (const text of new Set(texts)) {
        if (counted.has(text)) continue;
        try {
          const tokens = await countAsync(text);
          if (Number.isFinite(tokens) && tokens >= 0) counted.set(text, Math.ceil(tokens));
        } catch {
          continue;
        }
      }
    },
  };
}

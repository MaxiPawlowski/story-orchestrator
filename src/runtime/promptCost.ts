import { estimateTokens } from "@memory/budget";
import { fnv1a } from "./hash";
import type { NextTurnBudget, TokenCount } from "./nextTurn";

// What each block of the next prompt costs, in the main API's own tokenizer. On a
// connected llama.cpp textgen backend every uncached count is a request to the pod, so a value is
// counted at most once, only after a debounce, and never while a generation is open: the reply path never
// waits on it. A failed count keeps the chars/4 estimate the memory budget already uses, and says so.

export const PROMPT_COST_DEBOUNCE_MS = 400;
export const PROMPT_COST_CACHE_LIMIT = 500;

export interface PromptCostHost {
  count(text: string): Promise<number>;
  budget(): NextTurnBudget;
  notify(): void;
  busy(): boolean;
}

export interface PromptCostView {
  budget: NextTurnBudget | null;
  lastGenerationBudget: number | null;
}

const keyOf = (value: string): string => `${value.length}:${fnv1a(value)}`;

export class PromptCost {
  private host: PromptCostHost | null = null;
  private readonly counts = new Map<string, TokenCount>();
  private readonly wanted = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generationBudget: number | null = null;

  attach(host: PromptCostHost): () => void {
    this.host = host;
    return () => {
      if (this.host !== host) return;
      this.host = null;
      this.stop();
      this.counts.clear();
      this.wanted.clear();
    };
  }

  countOf(value: string): TokenCount | null {
    return this.counts.get(keyOf(value)) ?? null;
  }

  request(values: readonly string[]): void {
    if (!this.host) return;
    for (const value of values) {
      const key = keyOf(value);
      if (!this.counts.has(key)) this.wanted.set(key, value);
    }
    if (this.wanted.size && this.timer === null) this.arm();
  }

  noteGenerationBudget(value: number): void {
    if (Number.isFinite(value) && value > 0) this.generationBudget = value;
  }

  view(): PromptCostView {
    return { budget: this.host?.budget() ?? null, lastGenerationBudget: this.generationBudget };
  }

  private arm() {
    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, PROMPT_COST_DEBOUNCE_MS);
  }

  private stop() {
    if (this.timer !== null) globalThis.clearTimeout(this.timer);
    this.timer = null;
  }

  private async flush() {
    const host = this.host;
    if (!host || !this.wanted.size) return;
    if (host.busy()) {
      this.arm();
      return;
    }
    const batch = [...this.wanted.entries()];
    this.wanted.clear();
    let landed = 0;
    for (const [key, value] of batch) {
      let counted: TokenCount;
      try {
        const tokens = await host.count(value);
        counted = Number.isFinite(tokens) && tokens >= 0 ? { tokens: Math.ceil(tokens), source: "host" } : { tokens: estimateTokens(value), source: "estimate" };
      } catch {
        counted = { tokens: estimateTokens(value), source: "estimate" };
      }
      if (this.host !== host) return;
      this.remember(key, counted);
      landed += 1;
    }
    if (landed) host.notify();
    if (this.wanted.size && this.timer === null) this.arm();
  }

  private remember(key: string, counted: TokenCount) {
    this.counts.set(key, counted);
    if (this.counts.size <= PROMPT_COST_CACHE_LIMIT) return;
    const oldest = this.counts.keys().next().value;
    if (oldest !== undefined) this.counts.delete(oldest);
  }
}

export const promptCost = new PromptCost();

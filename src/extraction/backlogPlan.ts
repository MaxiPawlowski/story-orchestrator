import { maxTokensCap } from "./callBudget";
import { chunkMessages } from "./chunker";
import { inputBudget } from "./inputBudget";
import type { Preflight } from "./preflight";
import { transcriptPrefixCost } from "./sharedRead";
import type { RequestBudget } from "./tokenMeter";
import type { ChatMessageWindowEntry, SharedReadWindow } from "./types";

export const FALLBACK_BACKLOG_WINDOW = 8;

export interface BacklogPlan {
  windows: SharedReadWindow[];
  preflight: Preflight;
}

const byCount = (messages: readonly ChatMessageWindowEntry[], size: number): SharedReadWindow[] => {
  const windows: SharedReadWindow[] = [];
  for (let start = 0; start < messages.length; start += size) {
    const slice = messages.slice(start, start + size);
    windows.push({ from: slice[0].messageId, to: slice[slice.length - 1].messageId, messages: slice });
  }
  return windows;
};

// The memorize windows write memory only, never deltas, so they may be split: each
// is packed to the budget instead of eight messages. The whole-chat pass after them is tail-fit by the
// shared read itself, so the plan counts it as one request of at most the budget.
export async function planBacklog(messages: readonly ChatMessageWindowEntry[], overheadPrompt: string, budget: RequestBudget, maxMessages?: number): Promise<BacklogPlan> {
  const limits = inputBudget(budget.contextLimit, maxTokensCap("sharedRead"));
  const { meter } = budget;
  await meter.prime([overheadPrompt, ...messages.map((message) => message.text)]);
  const promptOverhead = meter.count(overheadPrompt);
  const perMessage = transcriptPrefixCost(messages, meter.count);
  const plan = chunkMessages(messages, { budget: limits.input, promptOverhead, count: meter.count, perMessage, ...(maxMessages ? { maxMessages } : {}) });
  const windows = plan.ok ? plan.windows.map(({ from, to, messages: kept }) => ({ from, to, messages: kept })) : byCount(messages, maxMessages ?? FALLBACK_BACKLOG_WINDOW);
  const cost = (window: SharedReadWindow) => window.messages.reduce((sum, message) => sum + meter.count(message.text) + perMessage, promptOverhead);
  const whole = cost({ from: 0, to: -1, messages: [...messages] });
  const full = Math.min(whole, Math.max(limits.input, promptOverhead));
  return { windows, preflight: { requests: windows.length + 1, tokens: windows.reduce((sum, window) => sum + cost(window), full) } };
}

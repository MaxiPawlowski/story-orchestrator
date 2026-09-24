import { capacityOf, markerRefusal, messageCost, truncateToFit, type BudgetMessage, type FitOptions, type FitWindow } from "./inputBudget";

export interface ChunkWindow<T extends BudgetMessage> extends FitWindow<T> {
  tokens: number;
  truncated: number[];
}

export type ChunkPlan<T extends BudgetMessage> =
  | { ok: true; capacity: number; windows: Array<ChunkWindow<T>>; oversized: number[] }
  | { ok: false; capacity: number; reason: string };

export function chunkMessages<T extends BudgetMessage>(messages: readonly T[], options: FitOptions): ChunkPlan<T> {
  const capacity = capacityOf(options);
  const refusal = markerRefusal(options);
  if (refusal) return { ok: false, capacity, reason: refusal };
  const windows: Array<ChunkWindow<T>> = [];
  const oversized: number[] = [];
  let current: ChunkWindow<T> | null = null;
  for (const original of messages) {
    let message = original;
    let cost = messageCost(message.text, options);
    if (cost > capacity) {
      message = { ...original, text: truncateToFit(original.text, capacity, options) };
      cost = messageCost(message.text, options);
      oversized.push(original.messageId);
    }
    if (current && current.tokens + cost > capacity) {
      windows.push(current);
      current = null;
    }
    if (!current) current = { from: message.messageId, to: message.messageId, messages: [], tokens: 0, truncated: [] };
    current.messages.push(message);
    current.to = message.messageId;
    current.tokens += cost;
    if (message !== original) current.truncated.push(original.messageId);
  }
  if (current) windows.push(current);
  return { ok: true, capacity, windows, oversized };
}

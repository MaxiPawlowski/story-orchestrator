import { fnv1a } from "@runtime/hash";

export type CompactionRefusal = "empty" | "longer-than-inputs" | "over-budget";

export interface CompactionCandidate {
  summary: string;
  previous: string | null;
  window: string;
  budgetTokens: number;
  count: (text: string) => number;
}

export const acceptCompaction = ({ summary, previous, window, budgetTokens, count }: CompactionCandidate): { ok: true } | { ok: false; reason: CompactionRefusal } => {
  const text = summary.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length >= (previous?.trim().length ?? 0) + window.trim().length) return { ok: false, reason: "longer-than-inputs" };
  if (count(text) > budgetTokens) return { ok: false, reason: "over-budget" };
  return { ok: true };
};

export const compactionKey = (window: { from: number; to: number }, previousId: string | null, input: string): string =>
  `${window.from}-${window.to}|${previousId ?? ""}|${fnv1a(input)}`;

const RETRIES = 1;

export class CompactionAttempts {
  private readonly refusals = new Map<string, number>();

  admits(key: string): boolean {
    return (this.refusals.get(key) ?? 0) <= RETRIES;
  }

  refused(key: string) {
    this.refusals.set(key, (this.refusals.get(key) ?? 0) + 1);
    if (this.refusals.size > 32) this.refusals.delete(this.refusals.keys().next().value as string);
  }

  accepted(key: string) {
    this.refusals.delete(key);
  }
}

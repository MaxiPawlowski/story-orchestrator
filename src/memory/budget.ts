import type { MemoryEntry, MemoryEntryType } from "./types";

export function estimateTokens(text: string): number {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function entryTokens(entry: MemoryEntry): number {
  return typeof entry.tokens === "number" ? entry.tokens : estimateTokens(entry.text);
}

export function tierTokenCost(entries: MemoryEntry[]): number {
  return entries.reduce((sum, entry) => sum + entryTokens(entry), 0);
}

export interface BudgetSelection {
  kept: Set<string>;
  dropped: MemoryEntry[];
}

export function selectWithinBudget(
  entries: MemoryEntry[],
  tokenBudget: number,
  score: (entry: MemoryEntry) => number,
  diversityFloor = 0,
): BudgetSelection {
  const kept = new Set<string>();
  let used = 0;

  for (const entry of entries) {
    if (!entry.pinned) continue;
    kept.add(entry.id);
    used += entryTokens(entry);
  }

  const scores = new Map<string, number>();
  const candidates = entries.filter((entry) => !entry.pinned);
  for (const entry of candidates) scores.set(entry.id, score(entry));
  const ranked = candidates.slice().sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));

  const tryKeep = (entry: MemoryEntry): boolean => {
    if (kept.has(entry.id)) return false;
    const cost = entryTokens(entry);
    if (used + cost > tokenBudget) return false;
    kept.add(entry.id);
    used += cost;
    return true;
  };

  if (diversityFloor > 0) {
    const perType = new Map<MemoryEntryType, number>();
    for (const entry of ranked) {
      const seen = perType.get(entry.type) ?? 0;
      if (seen >= diversityFloor) continue;
      if (tryKeep(entry)) perType.set(entry.type, seen + 1);
    }
  }

  for (const entry of ranked) tryKeep(entry);

  const dropped = candidates.filter((entry) => !kept.has(entry.id));
  return { kept, dropped };
}

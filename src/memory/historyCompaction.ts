export const COMPACTION_HIGH_SHARE = 0.75;
export const COMPACTION_LOW_SHARE = 0.5;
export const COMPACTION_KEEP_MESSAGES = 12;

export interface CompactionBand {
  high: number;
  low: number;
  keep: number;
}

export interface CompactionEntry {
  id: number;
  cost: number;
}

export interface CompactionPlan {
  cutId: number;
  dropped: number;
  tokens: number;
  clamped: boolean;
}

export const compactionBand = (contextTokens: number): CompactionBand | null =>
  (Number.isFinite(contextTokens) && contextTokens > 0
    ? { high: Math.floor(contextTokens * COMPACTION_HIGH_SHARE), low: Math.floor(contextTokens * COMPACTION_LOW_SHARE), keep: COMPACTION_KEEP_MESSAGES }
    : null);

export function compactionCut(costs: readonly number[], band: CompactionBand): number {
  let cut = 0;
  let held = 0;
  costs.forEach((cost, index) => {
    held += cost;
    if (held <= band.high) return;
    while (cut < index + 1 - band.keep && held > band.low) {
      held -= costs[cut];
      cut += 1;
    }
  });
  return cut;
}

export function planCompaction(entries: readonly CompactionEntry[], band: CompactionBand, ceiling: number): CompactionPlan | null {
  const planned = compactionCut(entries.map((entry) => entry.cost), band);
  let cut = planned;
  while (cut > 0 && entries[cut - 1].id > ceiling) cut -= 1;
  if (cut <= 0 || cut >= entries.length) return null;
  const tokens = entries.slice(0, cut).reduce((sum, entry) => sum + entry.cost, 0);
  return { cutId: entries[cut].id, dropped: cut, tokens, clamped: cut < planned };
}

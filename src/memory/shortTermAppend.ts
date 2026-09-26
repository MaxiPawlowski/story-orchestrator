import { blockTokens } from "./budget";
import type { ShortTermPlacement } from "./stores";
import type { MemoryEntry } from "./types";

const tokensOf = (rows: MemoryEntry[]) => rows.reduce((sum, row) => sum + blockTokens(row), 0);

export const appendShortTerm: ShortTermPlacement = (entries, entry, readLimits) => {
  const limits = readLimits();
  const tier = entries.filter((candidate) => candidate.tier === "short_term" && candidate.id !== entry.id);
  const pinned = tier.filter((candidate) => candidate.pinned);
  const kept = new Set([...pinned, entry].map((row) => row.id));
  let rows = kept.size;
  let tokens = tokensOf([...pinned, entry]);
  for (const row of tier.filter((candidate) => !candidate.pinned).reverse()) {
    const cost = blockTokens(row);
    if (rows + 1 > limits.rows || tokens + cost > limits.tokens) break;
    kept.add(row.id);
    rows += 1;
    tokens += cost;
  }
  const others = entries.filter((candidate) => candidate.id !== entry.id && (candidate.tier !== "short_term" || kept.has(candidate.id)));
  return { entries: [...others, entry], inputs: [] };
};

export function buildShortTermWindowPrompt(recentText: string): string {
  return [
    "Summarise the messages below in 1-2 sentences for use as recent-play memory.",
    "Keep names, places, numbers, promises and anything a character hid or revealed. Do not describe earlier play.",
    "Write in past tense, narrative style. Output only the summary text. No notes, no commentary.",
    "",
    "MESSAGES:",
    recentText,
  ].join("\n");
}

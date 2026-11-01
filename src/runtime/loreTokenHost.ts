import { loadScanLorebook } from "@services/STAPI";
import { estimateTokens } from "@extraction/callBudget";
import type { LoreTokenRow } from "./loreTokenSource";

export async function readLoreTokens(lorebook: string): Promise<LoreTokenRow[]> {
  const book = await loadScanLorebook(lorebook);
  return (book?.entries ?? []).map((entry) => ({
    comment: typeof entry.comment === "string" ? entry.comment : "", tokens: estimateTokens(entry.content), disabled: entry.disable === true,
    ...(entry.constant === true ? { constant: true } : {}),
  }));
}

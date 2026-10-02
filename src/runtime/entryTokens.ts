import { BLOCK_OVERHEAD_TOKENS, entryTokens, fitTextToTokens } from "@memory/budget";
import type { MemoryEntry } from "@memory/index";
import type { TokenHost } from "./hostPorts";

export async function tokensFor(host: TokenHost, text: string): Promise<number | undefined> {
  try {
    return await host.countTokens(text);
  } catch {
    return undefined;
  }
}

export async function computeEntryTokens(host: TokenHost, entries: MemoryEntry[]) {
  for (const entry of entries) entry.tokens = await tokensFor(host, entry.text);
}

export async function fitEntryToBlock(host: TokenHost, entry: MemoryEntry, budget: number) {
  const room = budget - BLOCK_OVERHEAD_TOKENS;
  for (let attempt = 0; attempt < 3 && entryTokens(entry) > room; attempt += 1) {
    const fitted = fitTextToTokens(entry.text, entryTokens(entry), room);
    if (!fitted || fitted === entry.text) return;
    entry.text = fitted;
    await computeEntryTokens(host, [entry]);
  }
}

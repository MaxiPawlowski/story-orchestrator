import { countTokens } from "@services/STAPI";
import type { MemoryEntry } from "@memory/index";

export async function tokensFor(text: string): Promise<number | undefined> {
  try {
    return await countTokens(text);
  } catch {
    return undefined;
  }
}

export async function computeEntryTokens(entries: MemoryEntry[]) {
  for (const entry of entries) entry.tokens = await tokensFor(entry.text);
}

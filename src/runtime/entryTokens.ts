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

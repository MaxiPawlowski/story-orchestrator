import { MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
import { MEMORY_TIERS, type MemoryEntry, type MemoryTier } from "./types";

export function memoryExtensionKey(tier: MemoryTier): string {
  return `${MEMORY_INJECTION_KEY_PREFIX}${tier}`;
}

export function buildMemoryInjectionBlocks(entries: MemoryEntry[], activeSpeakerId: string | null): Record<MemoryTier, string> {
  const blocks = {} as Record<MemoryTier, string>;
  MEMORY_TIERS.forEach((tier) => {
    const relevant = entries
      .filter((entry) => entry.tier === tier)
      .filter((entry) => tier !== "facts" || !entry.characterId || entry.characterId === activeSpeakerId)
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);
    blocks[tier] = relevant.map((entry) => entry.text).join("\n");
  });
  return blocks;
}

export function applyMemoryInjection(entries: MemoryEntry[], activeSpeakerId: string | null, depths: Record<MemoryTier, number>) {
  const blocks = buildMemoryInjectionBlocks(entries, activeSpeakerId);
  MEMORY_TIERS.forEach((tier) => {
    const text = blocks[tier];
    const key = memoryExtensionKey(tier);
    if (text) setStoryExtensionPrompt(key, text, depths[tier]);
    else clearStoryExtensionPrompt(key);
  });
}

export function clearAllMemoryInjection() {
  MEMORY_TIERS.forEach((tier) => clearStoryExtensionPrompt(memoryExtensionKey(tier)));
}

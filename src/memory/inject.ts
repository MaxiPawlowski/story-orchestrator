import { EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
import { selectWithinBudget } from "./budget";
import { scoreEntry, type ScoreContext } from "./score";
import { MEMORY_TIERS, type MemoryEntry, type MemoryTier } from "./types";

export const INJECTION_DIVERSITY_FLOOR = 1;

export interface InjectionOptions {
  tokenBudgets: Record<MemoryTier, number>;
  scoreContext: ScoreContext;
}

export function memoryExtensionKey(tier: MemoryTier): string {
  return `${MEMORY_INJECTION_KEY_PREFIX}${tier}`;
}

function selectTierEntries(entries: MemoryEntry[], tier: MemoryTier, activeSpeakerId: string | null, options: InjectionOptions): MemoryEntry[] {
  const candidates = entries
    .filter((entry) => entry.tier === tier)
    .filter((entry) => !entry.supersededBy && !entry.foldedInto)
    .filter((entry) => tier !== "facts" || !entry.characterId || entry.characterId === activeSpeakerId);
  const budget = options.tokenBudgets[tier];
  const { kept } = selectWithinBudget(candidates, budget, (entry) => scoreEntry(entry, options.scoreContext), INJECTION_DIVERSITY_FLOOR);
  return candidates.filter((entry) => kept.has(entry.id)).sort((a, b) => a.createdAt - b.createdAt);
}

export function buildMemoryInjectionBlocks(entries: MemoryEntry[], activeSpeakerId: string | null, options: InjectionOptions): Record<MemoryTier, string> {
  const blocks = {} as Record<MemoryTier, string>;
  MEMORY_TIERS.forEach((tier) => {
    blocks[tier] = selectTierEntries(entries, tier, activeSpeakerId, options).map((entry) => entry.text).join("\n");
  });
  return blocks;
}

export function applyMemoryInjection(entries: MemoryEntry[], activeSpeakerId: string | null, depths: Record<MemoryTier, number>, options: InjectionOptions) {
  const blocks = buildMemoryInjectionBlocks(entries, activeSpeakerId, options);
  MEMORY_TIERS.forEach((tier) => {
    const text = blocks[tier];
    const key = memoryExtensionKey(tier);
    if (text) setStoryExtensionPrompt(key, text, depths[tier]);
    else clearStoryExtensionPrompt(key);
  });
}

export function applyEpistemicInjection(block: string, depth: number) {
  if (block) setStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY, block, depth);
  else clearStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY);
}

export function clearEpistemicInjection() {
  clearStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY);
}

export function applyLedgerInjection(block: string, depth: number) {
  if (block) setStoryExtensionPrompt(LEDGER_INJECTION_KEY, block, depth);
  else clearStoryExtensionPrompt(LEDGER_INJECTION_KEY);
}

export function clearLedgerInjection() {
  clearStoryExtensionPrompt(LEDGER_INJECTION_KEY);
}

export function clearAllMemoryInjection() {
  MEMORY_TIERS.forEach((tier) => clearStoryExtensionPrompt(memoryExtensionKey(tier)));
  clearStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY);
  clearStoryExtensionPrompt(LEDGER_INJECTION_KEY);
}

import { EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
import { selectWithinBudget } from "./budget";
import { isLive } from "./provenance";
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

function selectTierEntries(entries: MemoryEntry[], tier: MemoryTier, activeSpeakerId: string | null, options: InjectionOptions): { entries: MemoryEntry[]; pinnedOverflow: number } {
  const candidates = entries
    .filter((entry) => entry.tier === tier)
    // v2.3 plan 05 (C3): a quarantined row is EXCLUDED, not ranked lower. A conflicted or
    // source-removed claim must not steer a reply, and a score penalty is something a strong entry
    // can outweigh.
    .filter((entry) => isLive(entry))
    .filter((entry) => !entry.supersededBy && !entry.foldedInto)
    .filter((entry) => tier !== "facts" || !entry.characterId || entry.characterId === activeSpeakerId);
  const budget = options.tokenBudgets[tier];
  const { kept, pinnedOverflow } = selectWithinBudget(candidates, budget, (entry) => scoreEntry(entry, options.scoreContext), INJECTION_DIVERSITY_FLOOR);
  return { entries: candidates.filter((entry) => kept.has(entry.id)).sort((a, b) => a.createdAt - b.createdAt), pinnedOverflow };
}

export interface TierInjection {
  blocks: Record<MemoryTier, string>;
  /** Pinned rows the budget could not fit — the author is told, rather than losing them silently. */
  pinnedOverflow: number;
}

export function buildMemoryInjection(entries: MemoryEntry[], activeSpeakerId: string | null, options: InjectionOptions): TierInjection {
  const blocks = {} as Record<MemoryTier, string>;
  let pinnedOverflow = 0;
  MEMORY_TIERS.forEach((tier) => {
    const selection = selectTierEntries(entries, tier, activeSpeakerId, options);
    pinnedOverflow += selection.pinnedOverflow;
    blocks[tier] = selection.entries.map((entry) => entry.text).join("\n");
  });
  return { blocks, pinnedOverflow };
}

export function buildMemoryInjectionBlocks(entries: MemoryEntry[], activeSpeakerId: string | null, options: InjectionOptions): Record<MemoryTier, string> {
  return buildMemoryInjection(entries, activeSpeakerId, options).blocks;
}

export function applyMemoryInjection(entries: MemoryEntry[], activeSpeakerId: string | null, depths: Record<MemoryTier, number>, options: InjectionOptions): number {
  const { blocks, pinnedOverflow } = buildMemoryInjection(entries, activeSpeakerId, options);
  MEMORY_TIERS.forEach((tier) => {
    const text = blocks[tier];
    const key = memoryExtensionKey(tier);
    if (text) setStoryExtensionPrompt(key, text, depths[tier]);
    else clearStoryExtensionPrompt(key);
  });
  return pinnedOverflow;
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

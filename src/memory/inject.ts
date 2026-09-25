import { EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
import { blockTokens, selectWithinBudget } from "./budget";
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

export type MemoryFate = "injected" | "quarantined" | "superseded" | "folded" | "other-speaker" | "over-budget" | "pinned-overflow";

export interface TierTrim {
  candidates: number;
  injected: number;
  dropped: number;
  tokensUsed: number;
  budget: number;
  hostCounted: number;
  filtered: number;
}

const filteredFate = (entry: MemoryEntry, tier: MemoryTier, activeSpeakerId: string | null): MemoryFate | null => {
  // v2.3 plan 05 (C3): a quarantined row is EXCLUDED, not ranked lower.
  if (!isLive(entry)) return "quarantined";
  if (entry.supersededBy) return "superseded";
  if (entry.foldedInto) return "folded";
  if (tier === "facts" && entry.characterId && entry.characterId !== activeSpeakerId) return "other-speaker";
  return null;
};

function selectTierEntries(entries: MemoryEntry[], tier: MemoryTier, activeSpeakerId: string | null, options: InjectionOptions, fates: Record<string, MemoryFate>): { entries: MemoryEntry[]; pinnedOverflow: number; trim: TierTrim } {
  const inTier = entries.filter((entry) => entry.tier === tier);
  const candidates = inTier.filter((entry) => {
    const fate = filteredFate(entry, tier, activeSpeakerId);
    if (fate) fates[entry.id] = fate;
    return fate === null;
  });
  const budget = options.tokenBudgets[tier];
  const { kept, dropped, pinnedOverflow } = selectWithinBudget(candidates, budget, (entry) => scoreEntry(entry, options.scoreContext), INJECTION_DIVERSITY_FLOOR);
  const injected = candidates.filter((entry) => kept.has(entry.id));
  injected.forEach((entry) => { fates[entry.id] = "injected"; });
  dropped.forEach((entry) => { fates[entry.id] = entry.pinned ? "pinned-overflow" : "over-budget"; });
  const trim: TierTrim = {
    candidates: candidates.length,
    injected: injected.length,
    dropped: dropped.length,
    tokensUsed: injected.reduce((sum, entry) => sum + blockTokens(entry), 0),
    budget,
    hostCounted: candidates.filter((entry) => typeof entry.tokens === "number").length,
    filtered: inTier.length - candidates.length,
  };
  return { entries: injected.sort((a, b) => a.createdAt - b.createdAt), pinnedOverflow, trim };
}

export interface TierInjection {
  blocks: Record<MemoryTier, string>;
  /** Pinned rows the budget could not fit — the author is told, rather than losing them silently. */
  pinnedOverflow: number;
  /** v2.4 plan 08 T19c: one fate per row, from the same filters and budget selection that built the blocks. */
  fates: Record<string, MemoryFate>;
  trim: Record<MemoryTier, TierTrim>;
}

export function buildMemoryInjection(entries: MemoryEntry[], activeSpeakerId: string | null, options: InjectionOptions): TierInjection {
  const blocks = {} as Record<MemoryTier, string>;
  const trim = {} as Record<MemoryTier, TierTrim>;
  const fates: Record<string, MemoryFate> = {};
  let pinnedOverflow = 0;
  MEMORY_TIERS.forEach((tier) => {
    const selection = selectTierEntries(entries, tier, activeSpeakerId, options, fates);
    pinnedOverflow += selection.pinnedOverflow;
    trim[tier] = selection.trim;
    blocks[tier] = selection.entries.map((entry) => entry.text).join("\n");
  });
  return { blocks, pinnedOverflow, fates, trim };
}

export interface MemoryInjectionView {
  fates: Record<string, MemoryFate>;
  trim: Record<MemoryTier, TierTrim & { highWater: number }>;
}

export const pinnedOverflowOf = (fates: Record<string, MemoryFate>): number => Object.values(fates).filter((fate) => fate === "pinned-overflow").length;

/** The session's largest injected size per tier: in memory only, labelled "this session" (a per-chat one would need a blob field). */
export function memoryInjectionView(injection: TierInjection, highWater: Partial<Record<MemoryTier, number>>): MemoryInjectionView {
  const trim = {} as MemoryInjectionView["trim"];
  MEMORY_TIERS.forEach((tier) => {
    const mark = Math.max(highWater[tier] ?? 0, injection.trim[tier].tokensUsed);
    highWater[tier] = mark;
    trim[tier] = { ...injection.trim[tier], highWater: mark };
  });
  return { fates: injection.fates, trim };
}

export function buildMemoryInjectionBlocks(entries: MemoryEntry[], activeSpeakerId: string | null, options: InjectionOptions): Record<MemoryTier, string> {
  return buildMemoryInjection(entries, activeSpeakerId, options).blocks;
}

export function applyMemoryInjection(entries: MemoryEntry[], activeSpeakerId: string | null, depths: Record<MemoryTier, number>, options: InjectionOptions): TierInjection {
  const injection = buildMemoryInjection(entries, activeSpeakerId, options);
  const { blocks } = injection;
  MEMORY_TIERS.forEach((tier) => {
    const text = blocks[tier];
    const key = memoryExtensionKey(tier);
    if (text) setStoryExtensionPrompt(key, text, depths[tier]);
    else clearStoryExtensionPrompt(key);
  });
  return injection;
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

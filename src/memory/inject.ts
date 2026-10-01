import { EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { blockTokens, selectWithinBudget } from "./budget";
import { isLive } from "./provenance";
import { scoreEntry, type ScoreContext } from "./score";
import { MEMORY_TIERS, type MemoryEntry, type MemoryTier } from "./types";

export const INJECTION_DIVERSITY_FLOOR = 1;

export interface PromptSink {
  setStoryExtensionPrompt: (key: string, text: string, depth: number) => unknown;
  clearStoryExtensionPrompt: (key: string) => unknown;
}

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
  // A quarantined row is EXCLUDED, not ranked lower.
  if (!isLive(entry)) return "quarantined";
  if (entry.supersededBy) return "superseded";
  if (entry.foldedInto) return "folded";
  if (tier === "facts" && entry.characterId && entry.characterId !== activeSpeakerId) return "other-speaker";
  return null;
};

function selectTierEntries(
  entries: MemoryEntry[],
  tier: MemoryTier,
  activeSpeakerId: string | null,
  options: InjectionOptions,
  fates: Record<string, MemoryFate>,
): { entries: MemoryEntry[]; pinnedOverflow: number; trim: TierTrim } {
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
  /** One fate per row, from the same filters and budget selection that built the blocks. */
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

export const MEMORY_BLOCK_LABELS: Record<MemoryTier, string> = {
  facts: "[Established facts — true in this story; stay consistent with them]",
  session_details: "[Details from this session]",
  short_term: "[Recent events]",
  scene_history: "[Earlier scenes]",
};

export const labelMemoryBlock = (tier: MemoryTier, text: string): string => (text ? `${MEMORY_BLOCK_LABELS[tier]}\n${text}` : "");

export function applyMemoryInjection(prompt: PromptSink, entries: MemoryEntry[], activeSpeakerId: string | null, depths: Record<MemoryTier, number>, options: InjectionOptions): TierInjection {
  const injection = buildMemoryInjection(entries, activeSpeakerId, options);
  const { blocks } = injection;
  MEMORY_TIERS.forEach((tier) => {
    const text = labelMemoryBlock(tier, blocks[tier]);
    const key = memoryExtensionKey(tier);
    if (text) prompt.setStoryExtensionPrompt(key, text, depths[tier]);
    else prompt.clearStoryExtensionPrompt(key);
  });
  return injection;
}

export function applyEpistemicInjection(prompt: PromptSink, block: string, depth: number) {
  if (block) prompt.setStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY, block, depth);
  else prompt.clearStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY);
}

export function clearEpistemicInjection(prompt: PromptSink) {
  prompt.clearStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY);
}

export function applyLedgerInjection(prompt: PromptSink, block: string, depth: number) {
  if (block) prompt.setStoryExtensionPrompt(LEDGER_INJECTION_KEY, block, depth);
  else prompt.clearStoryExtensionPrompt(LEDGER_INJECTION_KEY);
}

export function clearAllMemoryInjection(prompt: PromptSink) {
  MEMORY_TIERS.forEach((tier) => prompt.clearStoryExtensionPrompt(memoryExtensionKey(tier)));
  prompt.clearStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY);
  prompt.clearStoryExtensionPrompt(LEDGER_INJECTION_KEY);
  prompt.clearStoryExtensionPrompt(INJECTION_REGISTRY.storySoFar.key);
  prompt.clearStoryExtensionPrompt(INJECTION_REGISTRY.chapterBridge.key);
}

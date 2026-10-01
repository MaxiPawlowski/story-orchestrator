import { EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { blockTokens, selectWithinBudget } from "./budget";
import { isLive } from "./provenance";
import { scoreEntry, type ScoreContext } from "./score";
import { MEMORY_TIERS, type MemoryEntry, type MemoryTier } from "./types";

export const INJECTION_DIVERSITY_FLOOR = 1;

export const NEAR_DUPLICATE_SIMILARITY = 0.5;
export const SESSION_DETAILS_ROW_CAP = 12;

const DEDUPED_TIERS: ReadonlySet<MemoryTier> = new Set<MemoryTier>(["session_details"]);
const ROW_CAPS: Partial<Record<MemoryTier, number>> = { session_details: SESSION_DETAILS_ROW_CAP };
const STOP_WORDS: ReadonlySet<string> = new Set("a an the and or of to in on at is was his her their its as by with for he she they it that this be are has have had".split(" "));

const contentWords = (text: string): Set<string> =>
  new Set(text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((word) => word !== "" && !STOP_WORDS.has(word)));

const wordSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared);
};

const newestFirst = (a: MemoryEntry, b: MemoryEntry): number => (b.messageId ?? -1) - (a.messageId ?? -1) || b.createdAt - a.createdAt;

export function nearDuplicateIds(entries: MemoryEntry[]): Set<string> {
  const seen: Set<string>[] = [];
  const duplicates = new Set<string>();
  for (const entry of [...entries].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || newestFirst(a, b))) {
    const words = contentWords(entry.text);
    if (!entry.pinned && seen.some((other) => wordSimilarity(other, words) >= NEAR_DUPLICATE_SIMILARITY)) duplicates.add(entry.id);
    else seen.push(words);
  }
  return duplicates;
}

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

export type MemoryFate = "injected" | "quarantined" | "superseded" | "folded" | "other-speaker" | "near-duplicate" | "over-budget" | "pinned-overflow";

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
  const live = inTier.filter((entry) => {
    const fate = filteredFate(entry, tier, activeSpeakerId);
    if (fate) fates[entry.id] = fate;
    return fate === null;
  });
  const duplicates = DEDUPED_TIERS.has(tier) ? nearDuplicateIds(live) : new Set<string>();
  duplicates.forEach((id) => { fates[id] = "near-duplicate"; });
  const candidates = live.filter((entry) => !duplicates.has(entry.id));
  const budget = options.tokenBudgets[tier];
  const score = (entry: MemoryEntry) => scoreEntry(entry, options.scoreContext);
  const selection = selectWithinBudget(candidates, budget, score, INJECTION_DIVERSITY_FLOOR);
  const { kept } = selection;
  const cap = ROW_CAPS[tier];
  const overCap = cap === undefined ? [] : candidates.filter((entry) => kept.has(entry.id))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || score(b) - score(a) || newestFirst(a, b)).slice(cap);
  overCap.forEach((entry) => kept.delete(entry.id));
  const dropped = [...selection.dropped, ...overCap];
  const pinnedOverflow = selection.pinnedOverflow + overCap.filter((entry) => entry.pinned).length;
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

import { isEstablished } from "./conflicts";
import { isLive } from "./provenance";
import { applyConsolidation } from "./consolidate";
import { clearContradicted, parseSupersessionVerdicts, type UncertainPair } from "./supersede";
import type { MemoryEntry, MemoryStoreState } from "./types";

export const VERDICT_BATCH = 8;
export const VERDICT_PENDING_CAP = 32;
export const VERDICT_MAX_TOKENS = 256;

const pairKey = (pair: UncertainPair) => `${pair.existingId}>${pair.candidateId}`;

export function mergePending(pending: readonly UncertainPair[], incoming: readonly UncertainPair[]): UncertainPair[] {
  const seen = new Set<string>();
  return [...incoming, ...pending].filter((pair) => {
    const key = pairKey(pair);
    if (seen.has(key) || pair.existingId === pair.candidateId) return false;
    seen.add(key);
    return true;
  }).slice(0, VERDICT_PENDING_CAP);
}

const open = (entry: MemoryEntry | undefined): entry is MemoryEntry => Boolean(entry && isLive(entry) && !entry.supersededBy && !entry.foldedInto);

export function askablePairs(entries: readonly MemoryEntry[], pending: readonly UncertainPair[]): UncertainPair[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return pending.filter((pair) => {
    const existing = byId.get(pair.existingId);
    const candidate = byId.get(pair.candidateId);
    return open(existing) && open(candidate) && !isEstablished(existing) && !existing.locked && !candidate.locked;
  }).slice(0, VERDICT_BATCH);
}

export function buildVerdictPrompt(entries: readonly MemoryEntry[], pairs: readonly UncertainPair[]): string {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return [
    "You compare pairs of memories from one story. In each pair the NEWER memory was written after the OLDER one.",
    "For each pair answer on its own line:",
    "SUPERSEDE <n> when the newer memory replaces the older one, so the older one is no longer true now.",
    "INDEPENDENT <n> when both can be true at the same time.",
    "Answer every pair. No other text.",
    "",
    ...pairs.flatMap((pair, index) => [`${index + 1}. OLDER: ${byId.get(pair.existingId)?.text ?? ""}`, `   NEWER: ${byId.get(pair.candidateId)?.text ?? ""}`]),
  ].join("\n");
}

export interface VerdictPlan {
  supersede: UncertainPair[];
  independent: UncertainPair[];
}

export function planVerdicts(raw: string, pairs: readonly UncertainPair[]): VerdictPlan {
  const verdicts = parseSupersessionVerdicts(raw);
  const pick = (want: boolean) => pairs.filter((_, index) => verdicts.get(index + 1) === want);
  return { supersede: pick(true), independent: pick(false) };
}

export interface AppliedVerdicts {
  state: MemoryStoreState;
  superseded: UncertainPair[];
  cleared: string[];
}

export function applyVerdicts(state: MemoryStoreState, plan: VerdictPlan, at: { messageId: number; boundary: number }): AppliedVerdicts {
  const still = (pairs: UncertainPair[]) => askablePairs(state.entries, pairs);
  const superseded = still(plan.supersede);
  const cleared = still(plan.independent).map((pair) => pair.existingId);
  const retired = superseded.length
    ? applyConsolidation(state, { droppedIds: [], confirmedIds: [], uncertain: [], supersededPairs: superseded.map((pair) => ({ loserId: pair.existingId, winnerId: pair.candidateId })) }, at)
    : state;
  return { state: clearContradicted(retired, cleared), superseded, cleared };
}

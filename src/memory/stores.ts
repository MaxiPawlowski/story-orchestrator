import { stableStringify } from "@runtime/hash";
import type { MemoryEntry, MemoryExpiration, MemoryStoreState, MemoryTier, MemoryWriteLogEntry } from "./types";

export interface TurnRange {
  from: number;
  to: number;
}

const groupKey = (tier: MemoryTier, characterId: string | undefined) => `${tier}:${characterId ?? "shared"}`;

export function createMemoryState(): MemoryStoreState {
  return { entries: [], excluded: [], writeLog: [] };
}

export function hashMemoryText(text: string): string {
  const value = stableStringify(text.trim().toLowerCase());
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function addMemoryEntries(state: MemoryStoreState, entries: MemoryEntry[], range: TurnRange): { state: MemoryStoreState; accepted: MemoryEntry[]; discarded: MemoryEntry[] } {
  if (!entries.length) return { state, accepted: [], discarded: [] };
  const excludedSet = new Set(state.excluded);
  const survivors = entries.filter((entry) => !excludedSet.has(hashMemoryText(entry.text)));
  const discarded: MemoryEntry[] = entries.filter((entry) => excludedSet.has(hashMemoryText(entry.text)));

  const groups = new Map<string, MemoryEntry[]>();
  survivors.forEach((entry) => {
    const key = groupKey(entry.tier, entry.characterId);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  const accepted: MemoryEntry[] = [];
  const writeLog: MemoryWriteLogEntry[] = [...state.writeLog];
  groups.forEach((groupEntries, key) => {
    const covered = writeLog.some((entry) => entry.key === key && entry.range.from <= range.from && entry.range.to >= range.to);
    if (covered) {
      discarded.push(...groupEntries);
      return;
    }
    accepted.push(...groupEntries);
    writeLog.push({ key, range, appliedAt: Date.now() });
  });
  return {
    state: { ...state, entries: [...state.entries, ...accepted], writeLog: writeLog.slice(-100) },
    accepted,
    discarded,
  };
}

export function dropByMessageId(state: MemoryStoreState, messageId: number): MemoryStoreState {
  return { ...state, entries: state.entries.filter((entry) => entry.pinned || typeof entry.messageId !== "number" || entry.messageId < messageId) };
}

export function expireScoped(state: MemoryStoreState, expiration: MemoryExpiration): MemoryStoreState {
  return { ...state, entries: state.entries.filter((entry) => entry.pinned || entry.expiration !== expiration) };
}

export function setPinned(state: MemoryStoreState, id: string, pinned: boolean): MemoryStoreState {
  return { ...state, entries: state.entries.map((entry) => (entry.id === id ? { ...entry, pinned } : entry)) };
}

export function excludeEntry(state: MemoryStoreState, id: string): MemoryStoreState {
  const entry = state.entries.find((candidate) => candidate.id === id);
  if (!entry) return state;
  return { ...state, entries: state.entries.filter((candidate) => candidate.id !== id), excluded: [...state.excluded, hashMemoryText(entry.text)] };
}

export function editEntryText(state: MemoryStoreState, id: string, text: string): MemoryStoreState {
  return { ...state, entries: state.entries.map((entry) => (entry.id === id ? { ...entry, text } : entry)) };
}

export function capTier(state: MemoryStoreState, tier: MemoryTier, cap: number): MemoryStoreState {
  const tierEntries = state.entries.filter((entry) => entry.tier === tier);
  if (tierEntries.length <= cap) return state;
  const pinned = tierEntries.filter((entry) => entry.pinned);
  const rest = tierEntries.filter((entry) => !entry.pinned);
  const keepRest = rest.slice(-Math.max(0, cap - pinned.length));
  const keepIds = new Set([...pinned, ...keepRest].map((entry) => entry.id));
  return { ...state, entries: state.entries.filter((entry) => entry.tier !== tier || keepIds.has(entry.id)) };
}

export const DEFAULT_TIER_BUDGETS: Record<MemoryTier, number> = {
  facts: 50,
  session_details: 40,
  short_term: 10,
  scene_history: 30,
};

export function capAllTiers(state: MemoryStoreState, budgets: Record<MemoryTier, number> = DEFAULT_TIER_BUDGETS): MemoryStoreState {
  return (Object.keys(budgets) as MemoryTier[]).reduce((next, tier) => capTier(next, tier, budgets[tier]), state);
}

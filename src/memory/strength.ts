import type { MemoryEntry, MemoryExpiration, MemoryStoreState, MemoryTier } from "./types";

export const EVICTED_ARCHIVE = "archive:evicted";
export const EVICTED_ARCHIVE_CAP = 300;
export const STRENGTH_BASE_STABILITY = 12;
export const STRENGTH_USE_GAIN = 0.5;
export const STRENGTH_USES_COUNTED = 6;

export interface StampAt {
  messageId: number;
  boundary: number;
}

const STABILITY_SCALE: Record<MemoryExpiration, number> = { permanent: 2, session: 1, scene: 0.5 };

export const lastUseBoundary = (entry: MemoryEntry): number =>
  Math.max(entry.createdAt, ...(entry.usedAt ?? []).map((use) => use.boundary));

export function stabilityOf(entry: MemoryEntry): number {
  let stability = STRENGTH_BASE_STABILITY * (1 + 0.5 * (entry.importance - 1)) * STABILITY_SCALE[entry.expiration];
  let previous = entry.createdAt;
  const uses = [...(entry.usedAt ?? [])].sort((left, right) => left.boundary - right.boundary).slice(0, STRENGTH_USES_COUNTED);
  for (const use of uses) {
    const gap = Math.max(0, use.boundary - previous);
    stability *= 1 + STRENGTH_USE_GAIN * Math.min(1, gap / STRENGTH_BASE_STABILITY);
    previous = use.boundary;
  }
  return stability;
}

export function strengthOf(entry: MemoryEntry, boundary: number): number {
  const prior = 0.5 + 0.25 * (entry.importance - 1);
  const elapsed = Math.max(0, boundary - lastUseBoundary(entry));
  return prior * Math.exp(-elapsed / stabilityOf(entry));
}

export function stampUsed(state: MemoryStoreState, ids: readonly string[], at: StampAt): MemoryStoreState {
  if (!ids.length) return state;
  const used = new Set(ids);
  return {
    ...state,
    entries: state.entries.map((entry) => (used.has(entry.id) && !(entry.usedAt ?? []).some((use) => use.messageId === at.messageId)
      ? { ...entry, usedAt: [...(entry.usedAt ?? []), { messageId: at.messageId, boundary: at.boundary }] }
      : entry)),
  };
}

export const retentionStamp = (settings: { strengthRetention?: boolean }, messageId: number, boundary: number): StampAt | null =>
  (settings.strengthRetention !== false ? { messageId, boundary } : null);

export const isEvicted = (entry: MemoryEntry): boolean => entry.foldedInto === EVICTED_ARCHIVE;

const protectedRow = (entry: MemoryEntry): boolean => Boolean(entry.pinned || entry.locked || entry.provenance?.override || entry.provenance?.source === "author");

export function evictWeakest(state: MemoryStoreState, tier: MemoryTier, cap: number, at: StampAt): MemoryStoreState {
  const tierEntries = state.entries.filter((entry) => entry.tier === tier && !entry.foldedInto);
  if (tierEntries.length <= cap) return state;
  const kept = tierEntries.filter(protectedRow);
  const rest = tierEntries.filter((entry) => !protectedRow(entry))
    .map((entry, index) => ({ entry, index, strength: strengthOf(entry, at.boundary) }))
    .sort((left, right) => left.strength - right.strength || left.index - right.index);
  const evictCount = Math.max(0, tierEntries.length - Math.max(cap, kept.length));
  const evicted = new Set(rest.slice(0, evictCount).map(({ entry }) => entry.id));
  if (!evicted.size) return state;
  const entries = state.entries.map((entry) => (evicted.has(entry.id) ? { ...entry, foldedInto: EVICTED_ARCHIVE, evictedAt: { ...at } } : entry));
  return { ...state, entries: capArchive(entries, at.boundary) };
}

function capArchive(entries: MemoryEntry[], boundary: number): MemoryEntry[] {
  const archived = entries.filter(isEvicted);
  if (archived.length <= EVICTED_ARCHIVE_CAP) return entries;
  const drop = new Set(archived.map((entry, index) => ({ entry, index, strength: strengthOf(entry, boundary) }))
    .sort((left, right) => left.strength - right.strength || left.index - right.index)
    .slice(0, archived.length - EVICTED_ARCHIVE_CAP).map(({ entry }) => entry.id));
  return entries.filter((entry) => !drop.has(entry.id));
}

export function stripUseAfter(entry: MemoryEntry, messageId: number): MemoryEntry {
  let next = entry;
  if (next.usedAt?.length) {
    const kept = next.usedAt.filter((use) => use.messageId < messageId);
    if (kept.length !== next.usedAt.length) {
      const { usedAt: _used, ...rest } = next;
      next = kept.length ? { ...rest, usedAt: kept } : rest;
    }
  }
  if (next.evictedAt && next.evictedAt.messageId >= messageId) {
    const { evictedAt: _at, foldedInto: _into, ...rest } = next;
    next = rest;
  }
  return next;
}

import { stableStringify } from "@runtime/hash";
import { clearOverride, legacyProvenance, withOverride, withValidity } from "./provenance";
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

// A link made at or after the cut belongs to the state that is being removed. Exported because a row
// a derived artifact hands back (v2.3 plan 04) was captured after the cut and arrives carrying links
// the cut never had.
export function stripLinksAfter(entry: MemoryEntry, messageId: number): MemoryEntry {
  let next = entry;
  if (entry.supersededAt && entry.supersededAt.messageId >= messageId) {
    const { supersededBy: _by, supersededAt: _at, ...rest } = next;
    next = rest;
  }
  if (next.confirmedAt?.length) {
    const kept = next.confirmedAt.filter((at) => at.messageId < messageId);
    const removed = next.confirmedAt.length - kept.length;
    if (removed) next = { ...next, recallCount: Math.max(0, next.recallCount - removed), ...(kept.length ? { confirmedAt: kept } : { confirmedAt: undefined }) };
  }
  return next;
}

// v2.3 plan 04. Three things go with the messages a mutation removed: the rows themselves, any
// supersession link MADE at or after that point (M1 — otherwise the predecessor stays retired by a
// winner that is gone), and the read coverage of the window it covered (M2 — otherwise the forced
// re-read of the corrected text is discarded as already seen).
export function dropByMessageId(state: MemoryStoreState, messageId: number, boundary = -1): MemoryStoreState {
  const kept = state.entries
    .flatMap((entry): MemoryEntry[] => {
      const found = entry.provenance;
      // v2.3 plan 05. An author decision is anchored to the boundary it was MADE at, not to the
      // message it was about. A decision that still stands outranks that message — the author kept
      // the claim knowing where it came from — so undoing the message does not touch it. Undoing the
      // decision itself does: the claim falls back to what its own source says, live while that
      // source is still in the chat and quarantined once it is not. A fact the author wrote outright
      // has no source to fall back to, so undoing its creation removes it. With no boundary to
      // compare against, only the source message decides, exactly as it did before.
      const decidedAt = found ? (found.override ? found.override.boundary : found.source === "author" ? found.boundary : null) : null;
      // `boundary` is where this rollback LANDS, so a decision or an authored creation at or after it
      // has not happened yet in the state being restored. Landing before it leaves the decision
      // standing: the author kept the claim knowing where it came from, and removing the message it
      // was about does not unmake a later, informed decision.
      const undone = decidedAt !== null && boundary >= 0 && decidedAt >= boundary;
      // The message this row was read from is at or after the cut, so it is gone from the chat.
      const removed = typeof entry.messageId === "number" && entry.messageId >= messageId;
      // An author's decision outlives the message it was about: they kept the claim knowing where it
      // came from, so the decision is undone by landing at or before the boundary it was made at, not
      // by removing its source.
      if (found?.override && !undone) return [stripLinksAfter(entry, messageId)];
      // Undoing the decision puts the row back where its own source left it: live while that source
      // is still in the chat, quarantined once it is not. A pinned row keeps its record either way;
      // an unpinned one is only kept at all when the author's decision was what kept it.
      if (undone) {
        // The decision is unmade, and with it the row it was made about: a claim with no life of its
        // own goes, and a kept record falls back to what its own source says — live while that source
        // is still in the chat, quarantined once it is not.
        if (!entry.pinned) return [];
        const { override: _undone, ...rest } = found ?? legacyProvenance();
        return [stripLinksAfter({ ...entry, provenance: { ...rest, validity: removed ? "source-removed" : "live" } }, messageId)];
      }
      if (removed) {
        // C3: a pinned row is kept as a RECORD, quarantined so no consumer reads it, rather than
        // surviving as if nothing happened. An unpinned row goes.
        if (!entry.pinned) return [];
        return [stripLinksAfter({ ...entry, ...withValidity(entry, "source-removed") }, messageId)];
      }
      return [stripLinksAfter(entry, messageId)];
    });
  const writeLog = state.writeLog.filter((entry) => entry.range.to < messageId);
  return { ...state, entries: kept, writeLog };
}

export function expireScoped(state: MemoryStoreState, expiration: MemoryExpiration): MemoryStoreState {
  return { ...state, entries: state.entries.filter((entry) => entry.pinned || entry.expiration !== expiration) };
}

export function setPinned(state: MemoryStoreState, id: string, pinned: boolean): MemoryStoreState {
  return { ...state, entries: state.entries.map((entry) => (entry.id === id ? { ...entry, pinned } : entry)) };
}

// v2.3 plan 05 (M6). Pin and lock are different promises: a pin says keep this row when the tier is
// trimmed, a lock says it is true and no pass may retire it. A contradicting candidate therefore goes
// to the reconciliation queue instead of superseding it. Locking pins too, because a row that cannot
// be superseded must not be evicted either, and the lock is itself an author decision — an override
// anchored to the boundary it was made at, so a rollback past that boundary unlocks it.
export function setLocked(state: MemoryStoreState, id: string, locked: boolean, at: string, boundary: number): MemoryStoreState {
  return {
    ...state,
    entries: state.entries.map((entry) => (entry.id === id ? { ...entry, locked, pinned: locked || entry.pinned, ...(locked ? withOverride(entry, "lock", at, boundary) : clearOverride(entry)) } : entry)),
  };
}

export function excludeEntry(state: MemoryStoreState, id: string): MemoryStoreState {
  const entry = state.entries.find((candidate) => candidate.id === id);
  if (!entry) return state;
  return { ...state, entries: state.entries.filter((candidate) => candidate.id !== id), excluded: [...state.excluded, hashMemoryText(entry.text)] };
}

export function restoreEntry(state: MemoryStoreState, entry: MemoryEntry): MemoryStoreState {
  if (state.entries.some((candidate) => candidate.id === entry.id)) return state;
  return { ...state, entries: [...state.entries, entry], excluded: state.excluded.filter((hash) => hash !== hashMemoryText(entry.text)) };
}

// v2.3 plan 05 (M7): the cached token count belonged to the text that was replaced, so an edited
// entry kept a cost it no longer had and could fit a budget it had outgrown. Clearing it makes the
// estimator apply immediately; `MemoryCoordinator.editMemoryEntry` then stores the exact count.
// The new text is the author's claim, not a read of a message, so it carries an override (V8).
export function editEntryText(state: MemoryStoreState, id: string, text: string, at: string, boundary: number): MemoryStoreState {
  return { ...state, entries: state.entries.map((entry) => (entry.id === id ? { ...entry, text, tokens: undefined, ...withOverride(entry, "edit", at, boundary) } : entry)) };
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

export const DEFAULT_TIER_TOKEN_BUDGETS: Record<MemoryTier, number> = {
  facts: 800,
  session_details: 600,
  short_term: 300,
  scene_history: 500,
};

export function capAllTiers(state: MemoryStoreState, budgets: Record<MemoryTier, number> = DEFAULT_TIER_BUDGETS): MemoryStoreState {
  return (Object.keys(budgets) as MemoryTier[]).reduce((next, tier) => capTier(next, tier, budgets[tier]), state);
}

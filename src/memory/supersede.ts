import type { MemoryStoreState } from "./types";

export interface UncertainPair {
  candidateId: string;
  existingId: string;
}

export function markContradicted(state: MemoryStoreState, uncertain: UncertainPair[]): MemoryStoreState {
  const ids = new Set(uncertain.map((pair) => pair.existingId));
  if (!ids.size) return state;
  return { ...state, entries: state.entries.map((entry) => (ids.has(entry.id) && !entry.contradicted ? { ...entry, contradicted: true } : entry)) };
}

export function clearContradicted(state: MemoryStoreState, ids: string[]): MemoryStoreState {
  const set = new Set(ids);
  if (!set.size) return state;
  return { ...state, entries: state.entries.map((entry) => (set.has(entry.id) && entry.contradicted ? { ...entry, contradicted: false } : entry)) };
}

const verdictPattern = /^(SUPERSEDE|INDEPENDENT)\s+(\d+)\s*$/i;

export function parseSupersessionVerdicts(raw: string): Map<number, boolean> {
  const verdicts = new Map<number, boolean>();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(verdictPattern);
    if (!match) continue;
    verdicts.set(Number(match[2]), match[1].toUpperCase() === "SUPERSEDE");
  }
  return verdicts;
}

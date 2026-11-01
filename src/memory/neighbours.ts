import { isEstablished } from "./conflicts";
import { isLive } from "./provenance";
import type { MemoryEntry, NeighbourTag } from "./types";

export const NEIGHBOUR_LIMIT = 12;
export const NEIGHBOUR_TEXT_CHARS = 200;
const NEIGHBOUR_TIERS: ReadonlySet<string> = new Set(["facts", "session_details"]);

export interface NeighbourRow {
  alias: string;
  id: string;
  text: string;
}

export interface NeighbourSet {
  rows: NeighbourRow[];
  section: string;
}

const lower = (value: string) => value.trim().toLowerCase();
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const named = (text: string, term: string) => term.length >= 2 && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text);

const standing = (entry: MemoryEntry) => isLive(entry) && !entry.supersededBy && !entry.foldedInto && NEIGHBOUR_TIERS.has(entry.tier);

export function selectNeighbours(entries: readonly MemoryEntry[], windowText: string, limit = NEIGHBOUR_LIMIT): MemoryEntry[] {
  if (!windowText.trim()) return [];
  return entries
    .map((entry, index) => {
      const terms = [...new Set([...entry.entities, ...(entry.keys ?? [])].map(lower).filter(Boolean))];
      const hits = terms.filter((term) => named(windowText, term)).length;
      return { entry, index, hits };
    })
    .filter(({ entry, hits }) => hits > 0 && standing(entry))
    .sort((left, right) => right.hits - left.hits || right.entry.importance - left.entry.importance
      || right.entry.createdAt - left.entry.createdAt || left.index - right.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > NEIGHBOUR_TEXT_CHARS ? `${flat.slice(0, NEIGHBOUR_TEXT_CHARS - 1)}…` : flat;
};

export const NEIGHBOUR_HEADER = "STORED MEMORIES this window may touch (read-only; never copy them as new lines):";
export const NEIGHBOUR_RULE = "A MEMORY or FACT line about one of them may add same=m<n> before text= when the window only repeats it (nothing new is stored), "
  + "or update=m<n> when the window changes it (your line replaces that memory). A line without either is new.";

export function neighbourSet(entries: readonly MemoryEntry[]): NeighbourSet | null {
  if (!entries.length) return null;
  const rows = entries.map((entry, index) => ({ alias: `m${index + 1}`, id: entry.id, text: clip(entry.text) }));
  return { rows, section: [NEIGHBOUR_HEADER, ...rows.map((row) => `[${row.alias}] ${row.text}`), NEIGHBOUR_RULE].join("\n") };
}

export function resolveNeighbour<T extends { neighbour?: NeighbourTag }>(line: T, rows: readonly NeighbourRow[] | null): { line: T; unknown: boolean } {
  if (!line.neighbour) return { line, unknown: false };
  const { neighbour, ...rest } = line;
  const row = rows?.find((candidate) => candidate.alias === neighbour.id);
  return row ? { line: { ...rest, neighbour: { kind: neighbour.kind, id: row.id } } as T, unknown: false } : { line: rest as T, unknown: true };
}

export interface NeighbourApply {
  stored: MemoryEntry[];
  incoming: MemoryEntry[];
  updates: Map<string, MemoryEntry>;
  confirmed: MemoryEntry[];
}

const untagged = (entry: MemoryEntry): MemoryEntry => {
  if (!entry.neighbour) return entry;
  const { neighbour: _tag, ...rest } = entry;
  return rest;
};

export function applyNeighbourConfirms(stored: readonly MemoryEntry[], incoming: readonly MemoryEntry[]): NeighbourApply {
  const byId = new Map(stored.map((entry) => [entry.id, entry]));
  const confirmed: MemoryEntry[] = [];
  const updates = new Map<string, MemoryEntry>();
  const kept: MemoryEntry[] = [];
  const next = new Map<string, MemoryEntry>();
  for (const entry of incoming) {
    const tag = entry.neighbour;
    const target = tag ? next.get(tag.id) ?? byId.get(tag.id) : undefined;
    if (!tag || !target || !standing(target) || [...updates.values()].includes(target)) {
      kept.push(untagged(entry));
      continue;
    }
    if (tag.kind === "same") {
      const at = { messageId: entry.messageId ?? -1, boundary: entry.createdAt };
      next.set(target.id, { ...target, recallCount: target.recallCount + 1, confirmedAt: [...(target.confirmedAt ?? []), at] });
      confirmed.push(entry);
      continue;
    }
    const plain = untagged(entry);
    if (!isEstablished(target) && !target.pinned) updates.set(plain.id, target);
    kept.push(plain);
  }
  return { stored: next.size ? stored.map((entry) => next.get(entry.id) ?? entry) : [...stored], incoming: kept, updates, confirmed };
}

export function linkNeighbourUpdates(stored: readonly MemoryEntry[], accepted: readonly MemoryEntry[], updates: ReadonlyMap<string, MemoryEntry>): MemoryEntry[] {
  if (!updates.size) return [...stored];
  const winners = new Map<string, MemoryEntry>();
  accepted.forEach((entry) => { const target = updates.get(entry.id); if (target) winners.set(target.id, entry); });
  return stored.map((entry) => {
    const winner = winners.get(entry.id);
    return winner && !entry.supersededBy ? { ...entry, supersededBy: winner.id, supersededAt: { messageId: winner.messageId ?? -1, boundary: winner.createdAt } } : entry;
  });
}

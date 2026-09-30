import type { NormalizedStoryV2 } from "@engine/index";
import type { LedgerBinding } from "./ledger";
import type { LedgerEntry, MemoryEntry } from "./types";
import { isLive } from "./provenance";
import { scoreEntry, type ScoreContext } from "./score";

// Who and what the memory model is allowed to talk about, derived from the story and
// the ledger rather than owned by a coordinator: the ledger pass, the extraction scope and the
// conflict queue all ask the same question, and each answering it for itself is how two of them end
// up disagreeing about the cast.

export function ledgerBindings(story: NormalizedStoryV2 | null): LedgerBinding[] {
  if (!story) return [];
  return Object.values(story.qualityByKey)
    .flatMap((quality) => (quality.ledger_binding
      ? [{ entity: quality.ledger_binding.entity, field: quality.ledger_binding.field, qualityKey: quality.key }]
      : []));
}

/** The roster, then the bound entities, then whatever the ledger has actually seen. */
export function ledgerEntityList(story: NormalizedStoryV2 | null, ledger: LedgerEntry[], nameOf: (member: NormalizedStoryV2["roster"][number]) => string): Array<{ name: string; type: string }> {
  if (!story) return [];
  const types = new Map<string, string>();
  for (const member of story.roster) types.set(nameOf(member), "character");
  for (const binding of ledgerBindings(story)) if (!types.has(binding.entity)) types.set(binding.entity, "character");
  for (const entry of ledger) types.set(entry.entity, entry.entityType);
  return [...types].map(([name, type]) => ({ name, type }));
}

export function storyEntities(story: NormalizedStoryV2 | null, ledger: LedgerEntry[], nameOf: (member: NormalizedStoryV2["roster"][number]) => string): string[] {
  if (!story) return [];
  const names = new Set<string>();
  for (const member of story.roster) names.add(nameOf(member));
  for (const binding of ledgerBindings(story)) names.add(binding.entity);
  for (const entry of ledger) names.add(entry.entity);
  return [...names].filter(Boolean);
}

/** Canon's facts: the best-scoring live ones (pinned and locked first), kept in store order so the
 *  input hash moves only when the chosen set does. */
export function selectCanonFacts(entries: MemoryEntry[], limit: number, context: ScoreContext): MemoryEntry[] {
  const usable = highImportanceFacts(entries, Number.POSITIVE_INFINITY);
  const held = usable.filter((entry) => entry.pinned || entry.locked);
  const ranked = usable.filter((entry) => !entry.pinned && !entry.locked).map((entry) => ({ entry, score: scoreEntry(entry, context) })).sort((a, b) => b.score - a.score);
  const chosen = new Set([...held, ...ranked.map((item) => item.entry)].slice(0, limit).map((entry) => entry.id));
  return usable.filter((entry) => chosen.has(entry.id));
}

/** The facts a synthesis is allowed to be built from: live, unretired, and worth carrying. */
export function highImportanceFacts(entries: MemoryEntry[], limit: number): MemoryEntry[] {
  return entries.filter((entry) => isLive(entry)).filter((entry) => entry.tier === "facts" && !entry.supersededBy && !entry.foldedInto && entry.importance >= 2).slice(0, limit);
}

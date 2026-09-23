import { generateMemoryId, type MemoryEntry } from "./types";

// v2.3 plan 04. Nothing derived survives the removal of what it was derived from. Every artifact a
// pass produces — a short-term compaction, a scene summary, an arc summary, the canon, a memory
// exclusion, a dedup — records the rows it was built from and the rows it took away, so a rollback
// past any of its inputs can drop it AND put back exactly what it removed. Without the second half
// a rolled-back dedup would leave the loser deleted forever, and a rolled-back exclusion would keep
// a fact out of the store it was derived for.
export const DERIVED_KINDS = ["short_term", "scene_summary", "arc_summary", "canon", "exclusion", "dedup"] as const;
export type DerivedKind = typeof DERIVED_KINDS[number];

export const DERIVED_LIMIT = 200;

/** Kinds whose output is re-synthesised by the next pass, so dropping the record marks the canon
 *  stale rather than restoring anything. */
const RE_DERIVED: DerivedKind[] = ["short_term", "scene_summary", "arc_summary", "canon"];

export interface DerivedRecord {
  id: string;
  kind: DerivedKind;
  boundary: number;
  messageId: number;
  /** Store ids the artifact was built from (memory entries, arcs, ledger keys). */
  inputs: string[];
  /** The entry this artifact produced in the memory tiers, so dropping it drops the output too. */
  outputId?: string;
  /** The message span it summarised or reacted to, when it has one. */
  range?: { from: number; to: number };
  /** Entries this artifact took out of the store, kept verbatim so the rollback can restore them. */
  removed?: MemoryEntry[];
  /** An exclusion's text hash, the key `excluded` is written with. */
  hash?: string;
}

export type DerivedInput = Omit<DerivedRecord, "id">;

export function recordDerived(records: DerivedRecord[], input: DerivedInput): DerivedRecord[] {
  return [...records, { ...input, id: generateMemoryId() }].slice(-DERIVED_LIMIT);
}

export interface DerivedReversal {
  records: DerivedRecord[];
  dropped: DerivedRecord[];
  outputIds: string[];
  restored: MemoryEntry[];
  lifted: string[];
  watermark: number | null;
  reDerive: boolean;
}

// An artifact goes when it was built at or after the rollback point, when the span it summarised
// starts there, or when something it was built from is among the rows this rollback removed. The
// last rule is deliberately about rows THIS rollback removed, not about rows that are absent: an
// exclusion's input is the row the exclusion itself took away, and a fact the author excluded at
// message 5 is not an input the rollback of message 40 invalidated.
export function rollbackDerived(records: DerivedRecord[], messageId: number, removedIds: Set<string>): DerivedReversal {
  const point = Math.max(0, Math.floor(messageId));
  const droppedIds = new Set<string>();
  const invalidatedIds = new Set(removedIds);
  // Dependency closure: dropping one summary removes its output, and a later artifact built from
  // that output has to drop too. One pass was insufficient when short-term B summarised short-term A.
  let changed = true;
  while (changed) {
    changed = false;
    records.forEach((record) => {
      if (droppedIds.has(record.id)) return;
      const built = record.messageId >= point || (record.range !== undefined && record.range.from >= point);
      // The output test is against the rows the ROLLBACK removed, not the closure's own set: an
      // artifact whose output is gone is itself gone, which is how a chain of summaries unwinds.
      const orphaned = (record.inputs ?? []).some((id) => invalidatedIds.has(id)) || (record.outputId !== undefined && removedIds.has(record.outputId));
      if (!built && !orphaned) return;
      droppedIds.add(record.id);
      if (record.outputId) invalidatedIds.add(record.outputId);
      changed = true;
    });
  }
  const dropped = records.filter((record) => droppedIds.has(record.id));
  const kept = records.filter((record) => !droppedIds.has(record.id));
  const restored = new Map<string, MemoryEntry>();
  const lifted: string[] = [];
  let watermark: number | null = null;
  dropped.forEach((record) => {
    (record.removed ?? [])
      // A row the cut never had is not restored: the artifact may well have taken away something
      // that arrived after the point, and putting it back would invent state the cut never saw.
      .filter((entry) => typeof entry.messageId !== "number" || entry.messageId < point)
      .forEach((entry) => restored.set(entry.id, entry));
    if (record.hash) lifted.push(record.hash);
    // A dropped summary leaves the watermark at the start of the span it covered, so the next pass
    // re-reads exactly the messages the summary was built from — not the end it had reached.
    if (record.range) watermark = watermark === null ? record.range.from - 1 : Math.min(watermark, record.range.from - 1);
  });
  // A hash is the text it was made from, so two exclusions of the same fact share one. Lifting it
  // for the dropped one would un-exclude the fact the surviving one still keeps out.
  const stillExcluded = new Set(kept.filter((record) => record.hash).map((record) => record.hash));
  const live = [...new Set(lifted.filter((hash) => !stillExcluded.has(hash)))];
  return {
    records: kept,
    dropped,
    outputIds: dropped.flatMap((record) => record.outputId ? [record.outputId] : []),
    restored: [...restored.values()],
    lifted: live,
    watermark,
    reDerive: dropped.some((record) => RE_DERIVED.includes(record.kind)),
  };
}

/** The entries a write removed, which is what a derived record keeps so it can put them back. */
export function disappearingEntries(before: MemoryEntry[], after: MemoryEntry[]): MemoryEntry[] {
  const live = new Set(after.map((entry) => entry.id));
  return before.filter((entry) => !live.has(entry.id));
}

import type { ArcEntry, ChapterDisposition, ChapterRecord, MemoryEntry } from "./types";

export interface FoldInput {
  entries: MemoryEntry[];
  arcs: ArcEntry[];
  shortTermSummaryEnd: number;
}

export interface FoldOutcome {
  entries: MemoryEntry[];
  arcs: ArcEntry[];
  shortTermSummaryEnd: number;
  folded: string[];
  resolved: string[];
}

const inRange = (messageId: number | undefined, range: { from: number; to: number }) =>
  typeof messageId === "number" && messageId >= range.from && messageId <= range.to;

const kept = (entry: MemoryEntry) => entry.pinned || entry.locked || Boolean(entry.supersededBy) || Boolean(entry.foldedInto);

export function foldsAtSeal(entry: MemoryEntry, range: { from: number; to: number }): boolean {
  if (kept(entry)) return false;
  if (entry.tier === "short_term") return typeof entry.messageId !== "number" || entry.messageId <= range.to;
  if (!inRange(entry.messageId, range)) return false;
  return entry.tier === "scene_history" || entry.tier === "session_details" || entry.importance === 1;
}

export function foldChapter(state: FoldInput, record: Pick<ChapterRecord, "id" | "range" | "open" | "sealedAt">, disposition: (arc: ArcEntry) => ChapterDisposition): FoldOutcome {
  const folded: string[] = [];
  const resolved: string[] = [];
  const entries = state.entries.map((entry) => {
    if (!foldsAtSeal(entry, record.range)) return entry;
    folded.push(entry.id);
    return { ...entry, foldedInto: record.id };
  });
  const arcs = state.arcs.map((arc): ArcEntry => {
    if (arc.pinned || arc.foldedInto) return arc;
    if (arc.status === "resolved") {
      if (!inRange(arc.resolvedMessageId, record.range)) return arc;
      folded.push(arc.id);
      return { ...arc, foldedInto: record.id };
    }
    const decided = disposition(arc);
    if (decided === "carry") return arc.originChapter ? arc : { ...arc, originChapter: record.id };
    resolved.push(arc.id);
    return { ...arc, status: "resolved", resolvedAt: record.sealedAt.boundary, resolvedMessageId: record.sealedAt.messageId, resolvedBy: record.id };
  });
  return { entries, arcs, shortTermSummaryEnd: Math.max(state.shortTermSummaryEnd, record.range.to), folded, resolved };
}

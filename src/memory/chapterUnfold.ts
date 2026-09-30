import type { ArcEntry, ChapterRecord, ChronicleState, MemoryEntry } from "./types";

export interface ChapterStores {
  entries: MemoryEntry[];
  arcs: ArcEntry[];
  chapters: ChapterRecord[];
  chronicle: ChronicleState;
}

const reopen = (arc: ArcEntry): ArcEntry => {
  const { resolvedAt: _at, resolvedMessageId: _message, resolvedBy: _by, ...rest } = arc;
  return { ...rest, status: "open" };
};

export function unfoldChapters<S extends ChapterStores>(state: S, recordIds: ReadonlySet<string>): Pick<S, keyof ChapterStores> {
  if (!recordIds.size) return { entries: state.entries, arcs: state.arcs, chapters: state.chapters, chronicle: state.chronicle };
  const entries = state.entries.map((entry) => {
    if (!entry.foldedInto || !recordIds.has(entry.foldedInto)) return entry;
    const { foldedInto: _folded, ...rest } = entry;
    return rest;
  });
  const arcs = state.arcs.map((arc) => {
    let next = arc.resolvedBy && recordIds.has(arc.resolvedBy) ? reopen(arc) : arc;
    if (next.foldedInto && recordIds.has(next.foldedInto)) {
      const { foldedInto: _folded, ...rest } = next;
      next = rest;
    }
    if (next.originChapter && recordIds.has(next.originChapter)) {
      const { originChapter: _origin, ...rest } = next;
      next = rest;
    }
    return next;
  });
  const chapters = state.chapters.filter((record) => !recordIds.has(record.id));
  const eras = state.chronicle.eras.filter((era) => !era.recordIds.some((id) => recordIds.has(id)));
  return { entries, arcs, chapters, chronicle: { eras } };
}

export function chaptersFrom(chapters: readonly ChapterRecord[], messageId: number, dropped: readonly string[]): Set<string> {
  const point = Math.max(0, Math.floor(messageId));
  const known = new Set(chapters.map((record) => record.id));
  return new Set([...dropped.filter((id) => known.has(id)), ...chapters.filter((record) => record.sealedAt.messageId >= point).map((record) => record.id)]);
}

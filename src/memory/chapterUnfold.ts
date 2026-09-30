import type { ArcEntry, ChapterRecord, ChronicleState, MemoryEntry } from "./types";

export interface ChapterStores {
  entries: MemoryEntry[];
  arcs: ArcEntry[];
  chapters: ChapterRecord[];
  chronicle: ChronicleState;
}

const without = <T extends object>(row: T, keys: string[]): T => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key))) as T;

export function unfoldChapters(state: ChapterStores, gone: ReadonlySet<string>): ChapterStores {
  if (!gone.size) return state;
  const named = (id: string | undefined) => id !== undefined && gone.has(id);
  const entries = state.entries.map((entry) => (named(entry.foldedInto) ? without(entry, ["foldedInto"]) : entry));
  const arcs = state.arcs.map((arc): ArcEntry => {
    const reopened: ArcEntry = named(arc.resolvedBy) ? { ...without(arc, ["resolvedAt", "resolvedMessageId", "resolvedBy"]), status: "open" } : arc;
    return without(reopened, [...(named(arc.foldedInto) ? ["foldedInto"] : []), ...(named(arc.originChapter) ? ["originChapter"] : [])]);
  });
  return {
    entries,
    arcs,
    chapters: state.chapters.filter((record) => !gone.has(record.id)),
    chronicle: { eras: state.chronicle.eras.filter((era) => !era.recordIds.some((id) => gone.has(id))) },
  };
}

export const chaptersFrom = (chapters: readonly ChapterRecord[], messageId: number, dropped: readonly string[]): Set<string> =>
  new Set(chapters.filter((record) => dropped.includes(record.id) || record.sealedAt.messageId >= messageId).map((record) => record.id));

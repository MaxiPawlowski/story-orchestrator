import type { SealSkip } from "./reverse";
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

export function unfoldAt(stores: ChapterStores, messageId: number, dropped: readonly string[]): ChapterStores {
  const gone = chaptersFrom(stores.chapters, messageId, dropped);
  const unfolded = unfoldChapters({ ...stores, chronicle: { eras: stores.chronicle.eras.filter((era) => era.messageId < messageId) } }, gone);
  return { ...unfolded, chapters: rewindRecordMarks(unfolded.chapters, messageId) };
}

const stampRecord = (chapters: ChapterRecord[], recordId: string, stamp: (record: ChapterRecord) => ChapterRecord | null): ChapterRecord[] => {
  const index = chapters.findIndex((record) => record.id === recordId);
  const next = index >= 0 ? stamp(chapters[index]) : null;
  return next ? chapters.map((record, at) => (at === index ? next : record)) : chapters;
};

export const commitRecordBridge = (chapters: ChapterRecord[], recordId: string, messageId: number): ChapterRecord[] =>
  stampRecord(chapters, recordId, (record) => (record.bridge && record.bridge.committedAt === undefined ? { ...record, bridge: { ...record.bridge, committedAt: messageId } } : null));

export const markRecapSeen = (chapters: ChapterRecord[], recordId: string, messageId: number): ChapterRecord[] =>
  stampRecord(chapters, recordId, (record) => (record.recapSeenAt === undefined ? { ...record, recapSeenAt: messageId } : null));

export const pendingBridge = (chapters: readonly ChapterRecord[]): { recordId: string; text: string } | null => {
  const last = chapters[chapters.length - 1];
  return last?.bridge && last.bridge.committedAt === undefined && !last.final ? { recordId: last.id, text: last.bridge.text } : null;
};

export const rewindRecordMarks = (chapters: ChapterRecord[], messageId: number): ChapterRecord[] => chapters.map((record) => {
  const bridge = record.bridge && (record.bridge.committedAt ?? -1) >= messageId ? { text: record.bridge.text } : record.bridge;
  const recap = (record.recapSeenAt ?? -1) >= messageId;
  if (bridge === record.bridge && !recap) return record;
  const { recapSeenAt: _recap, bridge: _bridge, ...rest } = record;
  return { ...rest, ...(bridge ? { bridge } : {}), ...(recap ? {} : record.recapSeenAt === undefined ? {} : { recapSeenAt: record.recapSeenAt }) };
});

export const SEAL_SKIP_DEPTH = 8;

export const capSealSkip = (skip: unknown, depth = SEAL_SKIP_DEPTH): SealSkip | null => {
  const candidate = skip as Partial<SealSkip> | null | undefined;
  if (depth <= 0 || !Number.isInteger(candidate?.pathLength) || !Number.isInteger(candidate?.messageId)) return null;
  return { pathLength: candidate?.pathLength as number, messageId: candidate?.messageId as number, previous: capSealSkip(candidate?.previous, depth - 1) };
};

export const pushSealSkip = (current: SealSkip | null | undefined, next: { pathLength: number; messageId: number }): SealSkip =>
  ({ pathLength: next.pathLength, messageId: next.messageId, previous: capSealSkip(current, SEAL_SKIP_DEPTH - 1) });

export const chaptersFrom = (chapters: readonly ChapterRecord[], messageId: number, dropped: readonly string[]): Set<string> =>
  new Set(chapters.filter((record) => dropped.includes(record.id) || record.sealedAt.messageId >= messageId).map((record) => record.id));

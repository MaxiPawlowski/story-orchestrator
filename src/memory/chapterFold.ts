import { isEstablished } from "./conflicts";
import type { ArcEntry, ChapterDisposition, ChapterRecord, EpistemicEntry, MemoryEntry } from "./types";

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

const kept = (entry: MemoryEntry) => entry.pinned || isEstablished(entry) || Boolean(entry.supersededBy) || Boolean(entry.foldedInto);

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

const FOLDED_TAGS = new Set(["hiding", "suspects"]);

const lowered = (value: string) => value.trim().toLowerCase();

export function leavingCast(disable: unknown, roster: ReadonlyArray<{ id: string; name: string }>): Set<string> {
  const names = (Array.isArray(disable) ? disable : typeof disable === "string" ? [disable] : []).filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map(lowered);
  const out = new Set(names);
  roster.forEach((member) => {
    if (names.includes(lowered(member.id)) || names.includes(lowered(member.name))) [member.id, member.name].forEach((name) => out.add(lowered(name)));
  });
  return out;
}

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mentions = (text: string, name: string) => new RegExp(`(^|[^\\p{L}])${escaped(name)}($|[^\\p{L}])`, "iu").test(text);

export function epistemicTargets(entry: EpistemicEntry, cast: readonly string[]): string[] {
  if (entry.hiddenFrom?.trim()) return [lowered(entry.hiddenFrom)];
  const subject = lowered(entry.subject);
  return [...new Set(cast.map(lowered).filter((name) => name && name !== subject && mentions(entry.content, name)))];
}

export function foldEpistemic(entries: EpistemicEntry[], recordId: string, leaving: ReadonlySet<string>, cast: readonly string[]): { epistemic: EpistemicEntry[]; folded: string[] } {
  const folded: string[] = [];
  const epistemic = entries.map((entry) => {
    if (!FOLDED_TAGS.has(entry.tag) || entry.pinned || entry.locked || entry.supersededBy || entry.foldedInto || !leaving.has(lowered(entry.subject))) return entry;
    const targets = epistemicTargets(entry, cast);
    if (!targets.length || !targets.every((target) => leaving.has(target))) return entry;
    folded.push(entry.id);
    return { ...entry, foldedInto: recordId };
  });
  return { epistemic, folded };
}

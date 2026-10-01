import { jaccardSimilarity } from "./similarity";
import { generateMemoryId, type ArcEntry, type ParsedArcSignal } from "./types";

export const ARC_MIN_LENGTH = 15;
export const ARC_DEDUP_THRESHOLD = 0.4;
export const ARC_RESOLVE_THRESHOLD = 0.25;
export const ARC_RESOLVED_CAP = 30;
export const ARC_OPEN_CAP = 40;
export const ARC_OPEN_INJECT_LIMIT = 8;

export interface ArcSignalContext {
  boundary: number;
  messageId?: number;
}

export interface ApplyArcSignalsResult {
  arcs: ArcEntry[];
  opened: ArcEntry[];
  resolved: ArcEntry[];
}

export function openArcs(arcs: ArcEntry[]): ArcEntry[] {
  return arcs.filter((arc) => arc.status === "open");
}

export function resolvedArcs(arcs: ArcEntry[]): ArcEntry[] {
  return arcs.filter((arc) => arc.status === "resolved");
}

export function applyArcSignals(arcs: ArcEntry[], signals: ParsedArcSignal[], ctx: ArcSignalContext): ApplyArcSignalsResult {
  const next = arcs.map((arc) => ({ ...arc }));
  const resolved: ArcEntry[] = [];

  for (const signal of signals) {
    if (signal.kind !== "resolved") continue;
    let best: ArcEntry | undefined;
    let bestScore = ARC_RESOLVE_THRESHOLD;
    for (const arc of next) {
      if (arc.status !== "open") continue;
      const score = jaccardSimilarity(arc.text, signal.text);
      if (score >= bestScore) {
        best = arc;
        bestScore = score;
      }
    }
    if (best) {
      best.status = "resolved";
      best.resolvedAt = ctx.boundary;
      if (typeof ctx.messageId === "number") best.resolvedMessageId = ctx.messageId;
      resolved.push(best);
    }
  }

  const opened: ArcEntry[] = [];
  for (const signal of signals) {
    if (signal.kind !== "open") continue;
    const text = signal.text.trim();
    if (text.length <= ARC_MIN_LENGTH) continue;
    const priors = [...next.filter((arc) => arc.status === "open"), ...opened];
    if (priors.some((arc) => jaccardSimilarity(arc.text, text) >= ARC_DEDUP_THRESHOLD)) continue;
    opened.push({
      id: generateMemoryId(),
      text,
      status: "open",
      entities: [],
      openedAt: ctx.boundary,
      ...(typeof ctx.messageId === "number" ? { openedMessageId: ctx.messageId } : {}),
    });
  }

  return { arcs: [...next, ...opened], opened, resolved };
}

export function setArcPinned(arcs: ArcEntry[], id: string, pinned: boolean): ArcEntry[] {
  return arcs.map((arc) => (arc.id === id ? { ...arc, pinned } : arc));
}

export function removeArc(arcs: ArcEntry[], id: string): ArcEntry[] {
  return arcs.filter((arc) => arc.id !== id);
}

export function setArcSummary(arcs: ArcEntry[], id: string, summary: string): ArcEntry[] {
  return arcs.map((arc) => (arc.id === id ? { ...arc, summary } : arc));
}

export function rollbackArcs(arcs: ArcEntry[], messageId: number, boundary: number): ArcEntry[] {
  return arcs
    .filter((arc) => typeof arc.openedMessageId !== "number" || arc.openedMessageId < messageId)
    .map((arc) => {
      const resolvedAfter = (typeof arc.resolvedAt === "number" && arc.resolvedAt > boundary)
        || (typeof arc.resolvedMessageId === "number" && arc.resolvedMessageId >= messageId);
      if (arc.status === "resolved" && resolvedAfter) {
        const { resolvedAt: _resolvedAt, resolvedMessageId: _resolvedMessageId, summary: _summary, ...rest } = arc;
        return { ...rest, status: "open" as const };
      }
      return arc;
    });
}

export function capResolvedArcs(arcs: ArcEntry[], cap: number = ARC_RESOLVED_CAP): ArcEntry[] {
  const resolvedUnpinned = arcs.filter((arc) => arc.status === "resolved" && !arc.pinned && !arc.foldedInto);
  if (resolvedUnpinned.length <= cap) return arcs;
  const keep = new Set(resolvedUnpinned.slice(-cap).map((arc) => arc.id));
  return arcs.filter((arc) => arc.status !== "resolved" || arc.pinned || arc.foldedInto || keep.has(arc.id));
}

export function capOpenArcs(arcs: ArcEntry[], cap: number = ARC_OPEN_CAP): ArcEntry[] {
  const openUnpinned = arcs.filter((arc) => arc.status === "open" && !arc.pinned);
  if (openUnpinned.length <= cap) return arcs;
  const keep = new Set(openUnpinned.slice(-cap).map((arc) => arc.id));
  return arcs.filter((arc) => arc.status !== "open" || arc.pinned || keep.has(arc.id));
}

export function openArcTexts(arcs: ArcEntry[], limit?: number): string[] {
  const open = openArcs(arcs);
  if (limit === undefined || open.length <= limit) return open.map((arc) => arc.text);
  const pinnedIds = new Set(open.filter((arc) => arc.pinned).map((arc) => arc.id));
  const unpinned = open.filter((arc) => !arc.pinned);
  const recentIds = new Set(unpinned.slice(Math.max(0, unpinned.length - Math.max(0, limit - pinnedIds.size))).map((arc) => arc.id));
  return open.filter((arc) => pinnedIds.has(arc.id) || recentIds.has(arc.id)).map((arc) => arc.text);
}

export const PLAYER_THREAD_LIMIT = 5;
export const PLAYER_THREAD_OVERLAP = 0.4;
export const PLAYER_THREAD_WINDOW = 12;

export const playerThreadSince = (checkpointStartedBoundary: number, boundary: number): number =>
  Math.max(0, Math.min(checkpointStartedBoundary, boundary - PLAYER_THREAD_WINDOW));

const THREAD_FILLER = new Set([
  "that", "this", "with", "from", "what", "whether", "their", "there", "they", "them", "have", "been", "will",
  "when", "where", "which", "while", "still", "into", "about", "remains", "remain", "unknown", "party's", "party",
]);

const threadWords = (text: string) => new Set((text.toLowerCase().match(/[a-z']+/g) ?? []).filter((word) => word.length >= 4 && !THREAD_FILLER.has(word)));

const sameThread = (left: Set<string>, right: Set<string>) => {
  const smaller = Math.min(left.size, right.size);
  return smaller > 0 && [...left].filter((word) => right.has(word)).length / smaller >= PLAYER_THREAD_OVERLAP;
};

export function playerThreadTexts(arcs: ArcEntry[], sinceBoundary: number, limit = PLAYER_THREAD_LIMIT): string[] {
  const kept: Array<{ arc: ArcEntry; words: Set<string> }> = [];
  for (const arc of [...openArcs(arcs)].reverse()) {
    if (!arc.pinned && arc.openedAt < sinceBoundary) continue;
    const words = threadWords(arc.text);
    if (kept.some((entry) => sameThread(entry.words, words))) continue;
    kept.push({ arc, words });
  }
  const pinned = kept.filter((entry) => entry.arc.pinned);
  const recent = kept.filter((entry) => !entry.arc.pinned).slice(0, Math.max(0, limit - pinned.length));
  const shown = new Set([...pinned, ...recent].map((entry) => entry.arc.id));
  return openArcs(arcs).filter((arc) => shown.has(arc.id)).map((arc) => arc.text);
}

export interface ArcBridgeLike {
  arcMatch: string;
  anchor: string;
  amount: number;
}

export function matchArcBridges(bridges: ArcBridgeLike[], resolved: ArcEntry[]): Map<string, number> {
  const increments = new Map<string, number>();
  for (const arc of resolved) {
    const text = arc.text.toLowerCase();
    for (const bridge of bridges) {
      const match = bridge.arcMatch?.trim().toLowerCase();
      if (!match || !text.includes(match)) continue;
      increments.set(bridge.anchor, (increments.get(bridge.anchor) ?? 0) + bridge.amount);
    }
  }
  return increments;
}

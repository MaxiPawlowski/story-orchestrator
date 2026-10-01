import { playerThreadSince, playerThreadTexts, type ArcEntry, type MemoryEntry } from "@memory/index";

export interface LatestScene {
  text: string;
  sinceEntry: boolean;
}

const SHOWN_VALIDITIES = new Set(["live", "conflicted"]);

const shownScene = (entry: MemoryEntry, lastMessageId: number) => entry.tier === "scene_history" && !entry.foldedInto && !entry.supersededBy && !entry.contradicted
  && SHOWN_VALIDITIES.has(entry.provenance?.validity ?? "live") && (entry.messageId ?? -1) <= lastMessageId && Boolean(entry.text.trim());

export function latestScene(entries: MemoryEntry[], lastMessageId: number, checkpointStartedBoundary: number): LatestScene | null {
  const newest = entries.filter((entry) => shownScene(entry, lastMessageId))
    .reduce<MemoryEntry | null>((best, entry) => (!best || (entry.messageId ?? -1) >= (best.messageId ?? -1) ? entry : best), null);
  return newest ? { text: newest.text.trim(), sinceEntry: newest.createdAt >= checkpointStartedBoundary } : null;
}

export function currentThreads(arcs: ArcEntry[], checkpointStartedBoundary: number, boundary: number): string[] {
  const sinceEntry = playerThreadTexts(arcs, Math.max(0, checkpointStartedBoundary - 1));
  return sinceEntry.length ? sinceEntry : playerThreadTexts(arcs, playerThreadSince(checkpointStartedBoundary, boundary));
}

import { isEstablished } from "./conflicts";
import type { DerivedRecord } from "./derived";
import type { MemoryEntry, MemoryTier } from "./types";

export const RECAP_TIERS: ReadonlySet<MemoryTier> = new Set<MemoryTier>(["session_details", "short_term", "scene_history"]);

export const IN_WINDOW_MARGIN = 4;

const SPAN_KINDS: ReadonlySet<DerivedRecord["kind"]> = new Set<DerivedRecord["kind"]>(["short_term", "scene_summary"]);

const spanRecords = (derived: readonly DerivedRecord[]): ReadonlyMap<string, DerivedRecord> =>
  new Map(derived.filter((record) => record.outputId && SPAN_KINDS.has(record.kind)).map((record) => [record.outputId as string, record]));

export function recapSpanStart(entry: MemoryEntry, derived: readonly DerivedRecord[] | ReadonlyMap<string, DerivedRecord>): number | null {
  const byOutput = derived instanceof Map ? derived : spanRecords(derived as readonly DerivedRecord[]);
  const startOf = (id: string, seen: Set<string>): number | null => {
    const record = byOutput.get(id);
    if (!record?.range || seen.has(id)) return null;
    seen.add(id);
    const earlier = record.kind === "short_term" ? record.inputs.map((input) => startOf(input, seen)) : [];
    return earlier.some((start) => start === null) ? null : Math.min(record.range.from, ...(earlier as number[]));
  };
  if (entry.tier === "session_details") return typeof entry.messageId === "number" ? entry.messageId : null;
  return startOf(entry.id, new Set());
}

export function recapInWindow(entries: readonly MemoryEntry[], derived: readonly DerivedRecord[], windowFrom: number | null, margin = IN_WINDOW_MARGIN): Set<string> {
  if (windowFrom === null || !Number.isFinite(windowFrom)) return new Set();
  const threshold = Math.max(0, windowFrom) + margin;
  const byOutput = spanRecords(derived);
  return new Set(entries.filter((entry) => RECAP_TIERS.has(entry.tier) && !entry.pinned && !isEstablished(entry)).filter((entry) => {
    const start = recapSpanStart(entry, byOutput);
    return start !== null && start >= threshold;
  }).map((entry) => entry.id));
}

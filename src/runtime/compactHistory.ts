import { estimateTokens } from "@memory/budget";
import { compactionBand, planCompaction, type CompactionEntry, type CompactionPlan } from "@memory/historyCompaction";
import { chapterSettings } from "./chapters";
import type { ChapterPort } from "./chapterPort";
import { withholds } from "./generationLifecycle";

const IGNORE = Symbol.for("ignore");

export interface CompactRow {
  extra?: unknown;
  mes?: unknown;
  [key: string]: unknown;
}

export interface CompactOutcome extends CompactionPlan {
  compacted: number;
  ceiling: number;
}

const ignored = (row: CompactRow): boolean => Boolean((row.extra as Record<symbol, unknown> | null | undefined)?.[IGNORE]);

export const liveIds = (live: readonly unknown[]): Map<unknown, number> => {
  const ids = new Map<unknown, number>();
  live.forEach((message, index) => {
    const extra = (message as { extra?: unknown } | null)?.extra;
    if (extra && typeof extra === "object") ids.set(extra, index);
  });
  return ids;
};

export function compactionEntries(rows: readonly CompactRow[], idOf: (row: CompactRow) => number | null): CompactionEntry[] {
  return rows.flatMap((row) => {
    const id = ignored(row) ? null : idOf(row);
    return id === null ? [] : [{ id, cost: estimateTokens(typeof row.mes === "string" ? row.mes : "") }];
  });
}

export function compactRows(rows: CompactRow[], idOf: (row: CompactRow) => number | null, cutId: number): number {
  let compacted = 0;
  let pending: number[] = [];
  const ignore = (index: number) => {
    const row = rows[index];
    const extra = typeof row.extra === "object" && row.extra !== null ? row.extra : {};
    rows[index] = { ...row, extra: { ...extra, [IGNORE]: true } };
    compacted += 1;
  };
  for (let index = 0; index < rows.length; index += 1) {
    if (ignored(rows[index])) continue;
    const id = idOf(rows[index]);
    if (id === null) {
      pending.push(index);
      continue;
    }
    if (id >= cutId) break;
    pending.forEach(ignore);
    pending = [];
    ignore(index);
  }
  return compacted;
}

export function compactionCeiling(readEnd: number | null, shortTermSummaryEnd: number): number | null {
  return readEnd === null || readEnd < 0 ? null : Math.min(readEnd, shortTermSummaryEnd);
}

export function compact(port: ChapterPort, rows: CompactRow[], type: unknown, live: readonly unknown[], contextTokens: number, readEnd: number | null): CompactOutcome | null {
  const memory = port.host.memory();
  if (!chapterSettings(memory.settings.chapters).compact || !memory.settings.enabled || withholds(type)) return null;
  const band = compactionBand(contextTokens);
  const ceiling = compactionCeiling(readEnd, memory.shortTermSummaryEnd);
  if (!band || ceiling === null) return null;
  const ids = liveIds(live);
  const idOf = (row: CompactRow) => ids.get(row.extra) ?? null;
  const plan = planCompaction(compactionEntries(rows, idOf), band, ceiling);
  if (!plan) return null;
  const compacted = compactRows(rows, idOf, plan.cutId);
  if (port.compactedTo !== plan.cutId) {
    port.compactedTo = plan.cutId;
    port.host.deps.chapterHost?.journal(`compacted ${compacted} older ${compacted === 1 ? "message" : "messages"} out of the prompt`,
      `messages before ${plan.cutId}, about ${plan.tokens} tokens; the memory tiers cover them up to message ${ceiling}${plan.clamped ? " (held back to the last read)" : ""}`);
  }
  return { ...plan, compacted, ceiling };
}

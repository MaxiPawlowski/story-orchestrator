import { estimateTokens } from "@memory/budget";
import { createTokenMeter } from "@extraction/tokenMeter";
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

const textOf = (row: CompactRow): string => (typeof row.mes === "string" ? row.mes : "");

export const COMPACTION_METER_LIMIT = 4000;

export function compactionEntries(rows: readonly CompactRow[], idOf: (row: CompactRow) => number | null, cost: (text: string) => number = estimateTokens): CompactionEntry[] {
  return rows.flatMap((row) => {
    const id = ignored(row) ? null : idOf(row);
    return id === null ? [] : [{ id, cost: cost(textOf(row)), player: row.is_user === true }];
  });
}

const compacting = (port: ChapterPort): boolean => {
  const memory = port.host.memory();
  return chapterSettings(memory.settings.chapters).compact && memory.settings.enabled;
};

const countsTokens = (port: ChapterPort): boolean => port.host.memory().settings.compactionTokens !== false;

export async function primeCompaction(port: ChapterPort, rows: readonly CompactRow[], type: unknown, contextTokens: number): Promise<number> {
  const band = compactionBand(contextTokens);
  const host = port.host.deps.hosts?.tokens;
  if (!band || !host || withholds(type) || !compacting(port) || !countsTokens(port)) return 0;
  const texts = rows.filter((row) => !ignored(row)).map(textOf);
  if (texts.reduce((sum, text) => sum + estimateTokens(text), 0) < band.low / 2) return 0;
  if (!port.compactMeter || port.compactMeter.size() > COMPACTION_METER_LIMIT) port.compactMeter = meterOf((text) => host.countTokens(text));
  await port.compactMeter.prime(texts);
  return texts.length;
}

export interface CompactionMeter {
  count: (text: string) => number;
  prime: (texts: readonly string[]) => Promise<void>;
  size: () => number;
}

export function meterOf(countAsync: (text: string) => Promise<number>): CompactionMeter {
  const seen = new Set<string>();
  const meter = createTokenMeter(countAsync);
  return {
    count: meter.count,
    prime: async (texts) => { texts.forEach((text) => seen.add(text)); await meter.prime(texts); },
    size: () => seen.size,
  };
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
  if (!compacting(port) || withholds(type)) return null;
  const band = compactionBand(contextTokens);
  const ceiling = compactionCeiling(readEnd, memory.shortTermSummaryEnd);
  if (!band || ceiling === null) return null;
  const ids = liveIds(live);
  const idOf = (row: CompactRow) => ids.get(row.extra) ?? null;
  const plan = planCompaction(compactionEntries(rows, idOf, countsTokens(port) && port.compactMeter ? port.compactMeter.count : estimateTokens), band, ceiling);
  if (!plan) return null;
  const compacted = compactRows(rows, idOf, plan.cutId);
  if (port.compactedTo !== plan.cutId) {
    port.compactedTo = plan.cutId;
    port.host.deps.chapterHost?.journal(`compacted ${compacted} older ${compacted === 1 ? "message" : "messages"} out of the prompt`,
      `messages before ${plan.cutId}, about ${plan.tokens} tokens; the memory tiers cover them up to message ${ceiling}${plan.clamped ? " (held back to the last read)" : ""}`);
  }
  return { ...plan, compacted, ceiling };
}

import { isCreateOp, isNoteOp, type CuratorOpRecord, type CuratorProposalRecord } from "./types";

export type WriteAheadOutcome = "applied" | "retry" | "left";
export type WriteAheadCounts = Record<WriteAheadOutcome, number>;

export interface WriteAheadLive {
  content: string;
  disabled: boolean;
  uid?: number;
}

const holds = (live: WriteAheadLive, image: { content: string; disabled: boolean } | undefined): boolean =>
  image !== undefined && live.content === image.content && live.disabled === image.disabled;

export const noWriteAheads = (): WriteAheadCounts => ({ applied: 0, retry: 0, left: 0 });

export const hasPendingWriteAhead = (entry: CuratorOpRecord): boolean => entry.writeAhead?.status === "pending";

const writeAheadKey = (recordId: string, index: number) => `${recordId}#${index}`;

export const pendingWriteAheads = (proposals: CuratorProposalRecord[]): Array<{ key: string; entry: CuratorOpRecord }> =>
  proposals.flatMap((record) => record.ops.flatMap((entry, index) => (hasPendingWriteAhead(entry) ? [{ key: writeAheadKey(record.id, index), entry }] : [])));

export function settleWriteAhead(entry: CuratorOpRecord, live: WriteAheadLive | null): { outcome: WriteAheadOutcome; record: CuratorOpRecord } {
  const cleared: CuratorOpRecord = { ...entry, writeAhead: undefined };
  const name = isNoteOp(entry.op) ? "note" : entry.op.comment;
  if (isCreateOp(entry.op)) return settleCreate(entry, cleared, name, live);
  if (!live) return { outcome: "left", record: { ...cleared, status: "failed", message: `"${name}" was gone when this chat reloaded` } };
  if (holds(live, entry.after)) return { outcome: "applied", record: { ...cleared, status: "applied", message: `"${name}" was written before the reload` } };
  if (holds(live, entry.before)) return { outcome: "retry", record: { ...cleared, status: "accepted", message: `"${name}" was not written before the reload; the next boundary writes it` } };
  return { outcome: "left", record: { ...cleared, status: "externally-edited", message: `"${name}" holds neither the old nor the new text after the reload, so it was left alone` } };
}

function settleCreate(entry: CuratorOpRecord, cleared: CuratorOpRecord, name: string, live: WriteAheadLive | null): { outcome: WriteAheadOutcome; record: CuratorOpRecord } {
  if (!live) return { outcome: "retry", record: { ...cleared, status: "accepted", message: `"${name}" was not created before the reload; the next boundary creates it` } };
  if (holds(live, entry.after) && live.uid !== undefined && entry.target) {
    return { outcome: "applied", record: { ...cleared, status: "applied", message: `"${name}" was created before the reload`, target: { ...entry.target, uid: live.uid } } };
  }
  return { outcome: "left", record: { ...cleared, status: "externally-edited", message: `"${name}" exists but holds other text after the reload, so it was left alone` } };
}

export function settleWriteAheads(proposals: CuratorProposalRecord[], live: Map<string, WriteAheadLive | null>, now: string): { proposals: CuratorProposalRecord[]; counts: WriteAheadCounts } {
  const counts = noWriteAheads();
  const next = proposals.map((record) => {
    let writtenAt: number | undefined;
    const ops = record.ops.map((entry, index) => {
      const key = writeAheadKey(record.id, index);
      if (!hasPendingWriteAhead(entry) || !live.has(key)) return entry;
      const settled = settleWriteAhead(entry, live.get(key) ?? null);
      counts[settled.outcome] += 1;
      if (settled.outcome === "applied") writtenAt = entry.writeAhead?.messageId ?? writtenAt;
      return settled.record;
    });
    if (ops.every((entry, index) => entry === record.ops[index])) return record;
    return { ...record, ops, ...(writtenAt !== undefined ? { appliedAt: record.appliedAt ?? now, messageId: writtenAt } : {}) };
  });
  return { proposals: next, counts };
}

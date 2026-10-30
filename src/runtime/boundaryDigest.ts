import type { BoundaryLogEntry, NormalizedStory, PrimitiveValue } from "@engine/index";
import { outgoingGateRows, qualityLabel, type GateRow } from "./gateReadout";

export type ChangeSource = "read" | "code" | "re-check" | "engine";

export interface BoundaryChange {
  key: string;
  label: string;
  before: string;
  after: string;
  by: ChangeSource;
}

export interface BoundaryDigest {
  boundary: number;
  messageId: number;
  source: "gate" | "manual";
  fired: { from: string; to: string; fromName: string; toName: string } | null;
  stayedAt: { id: string; name: string } | null;
  changes: BoundaryChange[];
  gates: GateRow[];
  discarded: number;
}

const SOURCE_OF: Record<string, ChangeSource> = { extractor: "read", mechanical: "code", reconciliation: "re-check" };

const text = (value: PrimitiveValue | undefined) => (value === undefined ? "unset" : String(value));

const writers = (entry: BoundaryLogEntry): Map<string, ChangeSource> => {
  const by = new Map<string, ChangeSource>();
  entry.queue.applied.forEach((applied) => applied.deltas.forEach((delta) => by.set(delta.q, SOURCE_OF[applied.source] ?? "code")));
  return by;
};

const checkpointName = (story: NormalizedStory | null, id: string) => story?.checkpointById[id]?.name ?? id;

export function boundaryDigest(story: NormalizedStory | null, entry: BoundaryLogEntry): BoundaryDigest {
  const before = entry.before.blackboard.values;
  const after = entry.after.blackboard.values;
  const by = writers(entry);
  const changes = Object.keys({ ...before, ...after }).filter((key) => before[key] !== after[key]).sort().map((key) => ({
    key, label: qualityLabel(story, key), before: text(before[key]), after: text(after[key]), by: by.get(key) ?? "engine",
  }));
  const from = entry.before.activeCheckpointId;
  const gates = outgoingGateRows(story, from, entry.evaluated ?? after);
  return {
    boundary: entry.boundary,
    messageId: entry.context.lastMessageId,
    source: entry.source,
    fired: entry.fired ? { from: entry.fired.from, to: entry.fired.to, fromName: checkpointName(story, entry.fired.from), toName: checkpointName(story, entry.fired.to) } : null,
    stayedAt: entry.fired ? null : { id: from, name: checkpointName(story, from) },
    changes,
    gates: entry.fired ? gates.filter((row) => row.to === entry.fired?.to) : gates,
    discarded: entry.queue.discarded.length,
  };
}

export function boundaryDigests(story: NormalizedStory | null, log: readonly BoundaryLogEntry[], from: number, to: number): Record<number, BoundaryDigest[]> {
  const out: Record<number, BoundaryDigest[]> = {};
  for (const entry of log) {
    const messageId = entry.context.lastMessageId;
    if (!Number.isFinite(messageId) || messageId < from || messageId > to) continue;
    (out[messageId] ??= []).push(boundaryDigest(story, entry));
  }
  return out;
}

export interface KeyChange {
  boundary: number;
  messageId: number;
}

export function lastChanges(log: readonly BoundaryLogEntry[]): Record<string, KeyChange> {
  const out: Record<string, KeyChange> = {};
  for (const entry of log) {
    const before = entry.before.blackboard.values;
    const after = entry.after.blackboard.values;
    for (const key of Object.keys({ ...before, ...after })) {
      if (before[key] !== after[key]) out[key] = { boundary: entry.boundary, messageId: entry.context.lastMessageId };
    }
  }
  return out;
}

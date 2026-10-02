import type { PrimitiveValue } from "@engine/index";
import type { PendingDeltaReadout } from "./types";

export interface BlackboardRow {
  key: string;
  set: boolean;
  value: PrimitiveValue | null;
  gate: boolean;
  pending: { value: PrimitiveValue } | null;
}

export interface BlackboardSources {
  blackboard: Record<string, PrimitiveValue>;
  gateQualities?: string[];
  pendingDeltas: PendingDeltaReadout[];
}

export function blackboardRows(sources: BlackboardSources): BlackboardRow[] {
  const gates = new Set(sources.gateQualities ?? []);
  const pending = new Map(sources.pendingDeltas.map((delta) => [delta.quality, delta.value]));
  const keys = [...new Set([...Object.keys(sources.blackboard), ...gates, ...pending.keys()])];
  return keys.map((key) => ({
    key,
    set: key in sources.blackboard,
    value: sources.blackboard[key] ?? null,
    gate: gates.has(key),
    pending: pending.has(key) ? { value: pending.get(key) as PrimitiveValue } : null,
  }));
}

import type { PrimitiveValue } from "@engine/index";
import type { PendingDeltaReadout } from "./types";
import type { KeyChange } from "./boundaryDigest";
import { STATE_GROUPS, stateGroupOf, type StateGroup, type StateKeyMeta } from "./authorConsole";

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

export interface StateRow extends BlackboardRow {
  label: string;
  group: StateGroup;
  changedAt: KeyChange | null;
  fresh: boolean;
}

export interface StateGroupRows {
  group: StateGroup;
  rows: StateRow[];
}

export function stateTable(rows: readonly BlackboardRow[], meta: Readonly<Record<string, StateKeyMeta>>, boundary: number, query = "", only: StateGroup | "all" = "all"): StateGroupRows[] {
  const gates = new Set(rows.filter((row) => row.gate).map((row) => row.key));
  const needle = query.trim().toLowerCase();
  const shown = rows.map((row): StateRow => {
    const known = meta[row.key];
    const changedAt = known?.changedAt ?? null;
    return { ...row, label: known?.label ?? row.key, group: row.gate ? "gates" : known?.group ?? stateGroupOf(row.key, gates), changedAt, fresh: changedAt?.boundary === boundary };
  }).filter((row) => (only === "all" || row.group === only)
    && (!needle || row.key.toLowerCase().includes(needle) || row.label.toLowerCase().includes(needle) || String(row.value ?? "").toLowerCase().includes(needle)));
  return STATE_GROUPS.map((group) => ({ group, rows: shown.filter((row) => row.group === group).sort((left, right) => left.key.localeCompare(right.key)) }))
    .filter((entry) => entry.rows.length > 0);
}

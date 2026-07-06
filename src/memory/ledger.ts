import { generateMemoryId, type LedgerEntry, type LedgerView, type ParsedLedgerSignal } from "./types";

export const LEDGER_CAP = 60;

export type LedgerPrimitive = string | number | boolean;

export interface LedgerBinding {
  entity: string;
  field: string;
  qualityKey: string;
}

export interface LedgerSignalContext {
  boundary: number;
  messageId?: number;
}

export function ledgerKey(entity: string, field: string): string {
  return `${entity.trim().toLowerCase()}|${field.trim().toLowerCase()}`;
}

export function buildBoundKeySet(bindings: LedgerBinding[]): Set<string> {
  return new Set(bindings.map((binding) => ledgerKey(binding.entity, binding.field)));
}

export function applyLedgerSignals(
  entries: LedgerEntry[],
  signals: ParsedLedgerSignal[],
  boundKeys: Set<string>,
  ctx: LedgerSignalContext,
): LedgerEntry[] {
  const next = entries.map((entry) => ({ ...entry }));
  for (const signal of signals) {
    const value = signal.value.trim();
    if (!signal.entity.trim() || !signal.field.trim() || !value) continue;
    const key = ledgerKey(signal.entity, signal.field);
    if (boundKeys.has(key)) continue;
    const existing = next.find((entry) => ledgerKey(entry.entity, entry.field) === key);
    if (existing) {
      existing.value = value;
      if (signal.entityType.trim()) existing.entityType = signal.entityType.trim();
      existing.createdAt = ctx.boundary;
      if (typeof ctx.messageId === "number") existing.messageId = ctx.messageId;
    } else {
      next.push({
        id: generateMemoryId(),
        entity: signal.entity.trim(),
        entityType: signal.entityType.trim() || "entity",
        field: signal.field.trim(),
        value,
        createdAt: ctx.boundary,
        ...(typeof ctx.messageId === "number" ? { messageId: ctx.messageId } : {}),
      });
    }
  }
  return next;
}

export function setLedgerPinned(entries: LedgerEntry[], id: string, pinned: boolean): LedgerEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, pinned } : entry));
}

export function removeLedger(entries: LedgerEntry[], id: string): LedgerEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function rollbackLedger(entries: LedgerEntry[], messageId: number): LedgerEntry[] {
  return entries.filter((entry) => entry.pinned || typeof entry.messageId !== "number" || entry.messageId < messageId);
}

export function capLedger(entries: LedgerEntry[], cap: number = LEDGER_CAP): LedgerEntry[] {
  const trimmable = entries.filter((entry) => !entry.pinned);
  if (trimmable.length <= cap) return entries;
  const keep = new Set(trimmable.slice(-cap).map((entry) => entry.id));
  return entries.filter((entry) => entry.pinned || keep.has(entry.id));
}

export function buildLedgerView(
  entries: LedgerEntry[],
  bindings: LedgerBinding[],
  values: Record<string, LedgerPrimitive>,
  versions: Record<string, number>,
): LedgerView[] {
  const boundKeys = buildBoundKeySet(bindings);
  const rows: LedgerView[] = [];
  for (const binding of bindings) {
    const value = values[binding.qualityKey];
    if (value === undefined || value === null) continue;
    rows.push({ entity: binding.entity, field: binding.field, value: String(value), bound: true, turn: versions[binding.qualityKey] ?? 0 });
  }
  for (const entry of entries) {
    if (boundKeys.has(ledgerKey(entry.entity, entry.field))) continue;
    rows.push({ entity: entry.entity, field: entry.field, value: entry.value, bound: false, turn: entry.createdAt });
  }
  return rows;
}

export function renderLedgerBlock(view: LedgerView[]): string {
  if (!view.length) return "";
  const byEntity = new Map<string, string[]>();
  const order: string[] = [];
  for (const row of view) {
    if (!byEntity.has(row.entity)) {
      byEntity.set(row.entity, []);
      order.push(row.entity);
    }
    byEntity.get(row.entity)!.push(`${row.field}=${row.value}`);
  }
  const lines = order.map((entity) => `${entity}: ${byEntity.get(entity)!.join(" | ")}`);
  return ["Current state:", ...lines].join("\n");
}

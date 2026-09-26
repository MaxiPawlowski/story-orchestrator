import { isLive, keepPinnedFrom, provenance as provenanceOf, type ProvenanceSource } from "./provenance";
import { generateMemoryId, type LedgerEntry, type LedgerView, type ParsedLedgerSignal } from "./types";

export const LEDGER_CAP = 60;
export const LEDGER_ROW_CAP = 240;

export type LedgerPrimitive = string | number | boolean;

export interface LedgerBinding {
  entity: string;
  field: string;
  qualityKey: string;
}

export interface LedgerSignalContext {
  boundary: number;
  messageId?: number;
  /** Which pass wrote it. */
  pass?: string;
  source?: ProvenanceSource;
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
    // A change is a NEW version, never an overwrite. An in-place edit destroys the value a
    // rollback has to restore, which is the whole reason `rollbackLedger` could only keep or drop.
    const previous = next.filter((entry) => ledgerKey(entry.entity, entry.field) === key).at(-1);
    if (previous && isLive(previous) && previous.value === value) continue;
    next.push({
      id: generateMemoryId(),
      provenance: provenanceOf({
        source: ctx.source ?? "extractor",
        messageId: ctx.messageId ?? -1,
        boundary: ctx.boundary,
        pass: ctx.pass ?? "shared-read",
      }),
      entity: signal.entity.trim(),
      entityType: signal.entityType.trim() || previous?.entityType || "entity",
      field: signal.field.trim(),
      value,
      createdAt: ctx.boundary,
      ...(previous ? { supersedes: previous.id } : {}),
      ...(previous?.pinned ? { pinned: true } : {}),
      ...(typeof ctx.messageId === "number" ? { messageId: ctx.messageId } : {}),
    });
  }
  return next;
}

// A pin belongs to the KEY, not to one version of it: the author is saying "keep this fact", and a
// later version of the same fact is the same fact.
export function setLedgerPinned(entries: LedgerEntry[], id: string, pinned: boolean): LedgerEntry[] {
  const target = entries.find((entry) => entry.id === id);
  if (!target) return entries;
  const key = ledgerKey(target.entity, target.field);
  return entries.map((entry) => (ledgerKey(entry.entity, entry.field) === key ? { ...entry, pinned } : entry));
}

export function removeLedger(entries: LedgerEntry[], id: string): LedgerEntry[] {
  const target = entries.find((entry) => entry.id === id);
  if (!target) return entries;
  const key = ledgerKey(target.entity, target.field);
  return entries.filter((entry) => ledgerKey(entry.entity, entry.field) !== key);
}

export function rollbackLedger(entries: LedgerEntry[], messageId: number): LedgerEntry[] {
  return entries.flatMap((entry) => keepPinnedFrom(entry, messageId));
}

/** Below the engine's history floor a rollback only ever restores a key's
 *  newest version, so the older ones there are unreachable and go first. */
function trimOrder(kept: LedgerEntry[], older: LedgerEntry[], floor: number | null): LedgerEntry[] {
  if (floor === null) return older;
  const atFloor = new Map<string, string>();
  for (const entry of kept) if ((entry.messageId ?? -1) < floor) atFloor.set(ledgerKey(entry.entity, entry.field), entry.id);
  const unreachable = older.filter((entry) => (entry.messageId ?? -1) < floor && atFloor.get(ledgerKey(entry.entity, entry.field)) !== entry.id);
  return [...unreachable, ...older.filter((entry) => !unreachable.includes(entry))];
}

export function capLedger(entries: LedgerEntry[], keyCap: number = LEDGER_CAP, rowCap: number = LEDGER_ROW_CAP, floorMessageId: number | null = null): LedgerEntry[] {
  const keyOf = (entry: LedgerEntry) => ledgerKey(entry.entity, entry.field);
  const lastTouch = new Map<string, number>();
  entries.forEach((entry, index) => lastTouch.set(keyOf(entry), index));
  const pinnedKeys = new Set(entries.filter((entry) => entry.pinned).map(keyOf));
  const droppableKeys = [...lastTouch.entries()].filter(([key]) => !pinnedKeys.has(key)).sort((left, right) => left[1] - right[1]).map(([key]) => key);
  const dropKeys = new Set(droppableKeys.slice(0, Math.max(0, lastTouch.size - keyCap)));
  let kept = entries.filter((entry) => !dropKeys.has(keyOf(entry)));
  const newest = new Set<string>();
  const seen = new Set<string>();
  for (let index = kept.length - 1; index >= 0; index -= 1) {
    const key = keyOf(kept[index]);
    if (seen.has(key)) continue;
    seen.add(key);
    newest.add(kept[index].id);
  }
  const olderVersions = kept.filter((entry) => !newest.has(entry.id) && !entry.pinned);
  const excess = kept.length - rowCap;
  if (excess > 0) {
    const drop = new Set(trimOrder(kept, olderVersions, floorMessageId).slice(0, excess).map((entry) => entry.id));
    kept = kept.filter((entry) => !drop.has(entry.id));
  }
  return kept.length === entries.length ? entries : kept;
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
  // One row per key: the newest LIVE version is the fact, the older ones are what a rollback
  // restores. A quarantined version neither speaks for the key nor hides the version
  // it replaced, so the row falls back to the newest version still standing.
  const newest = new Map<string, LedgerEntry>();
  for (const entry of entries) {
    const key = ledgerKey(entry.entity, entry.field);
    if (boundKeys.has(key)) continue;
    if (!isLive(entry)) continue;
    const held = newest.get(key);
    if (!held || (entry.messageId ?? -1) >= (held.messageId ?? -1)) newest.set(key, entry);
  }
  for (const entry of newest.values()) {
    rows.push({ entity: entry.entity, field: entry.field, value: entry.value, bound: false, turn: entry.createdAt });
  }
  return rows;
}

export function renderLedgerBlock(view: LedgerView[]): string {
  if (!view.length) return "";
  const byEntity = new Map<string, string[]>();
  for (const row of view) {
    const fields = byEntity.get(row.entity) ?? [];
    fields.push(`${row.field}=${row.value}`);
    byEntity.set(row.entity, fields);
  }
  const lines = [...byEntity].map(([entity, fields]) => `${entity}: ${fields.join(" | ")}`);
  return ["Current state:", ...lines].join("\n");
}

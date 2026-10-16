import type { BoundaryLogEntry, PrimitiveValue, Quality, QualityDisplay } from "@engine/index";
import type { SheetGroupView, SheetItemView, Trend } from "./gameTypes";

export const INVENTORY_GROUP = "Inventory";
export const STATUS_GROUP = "Status";

const hidesWhenEmpty = (display: QualityDisplay) => display.hide_when_empty ?? (display.as === "item" || display.as === "count");

const bandAt = (display: QualityDisplay, value: number) => display.bands?.find((entry) => entry.max === undefined || value <= entry.max);

const bandLabel = (display: QualityDisplay, value: number): string | null => bandAt(display, value)?.label ?? null;

export const bandWarn = (display: QualityDisplay, value: PrimitiveValue | undefined): string | null =>
  (typeof value === "number" ? bandAt(display, value)?.warn ?? null : null);

const numberText = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const empty = (display: QualityDisplay, value: PrimitiveValue | undefined) =>
  value === undefined || value === false || (display.as === "count" && value === 0);

const trendOf = (quality: Quality, value: PrimitiveValue | undefined, previous: PrimitiveValue | undefined): Trend | undefined => {
  if (!quality.display?.trend || typeof value !== "number" || typeof previous !== "number") return undefined;
  if (value > previous) return "up";
  return value < previous ? "down" : "flat";
};

const itemText = (quality: Quality, display: QualityDisplay, value: PrimitiveValue): Omit<SheetItemView, "label" | "as"> => {
  if (display.as === "item") return { text: "" };
  if (display.as === "word" && quality.type === "enum") return { text: quality.player_labels?.[String(value)] ?? "" };
  if (typeof value !== "number") return { text: "" };
  const shown = value;
  const bounds = { value: shown, ...(display.min !== undefined ? { min: display.min } : {}), ...(display.max !== undefined ? { max: display.max } : {}) };
  if (display.as === "word") return { text: bandLabel(display, shown) ?? "", ...bounds };
  if (display.as === "count") return { text: numberText(shown), value: shown };
  return { text: display.bands ? bandLabel(display, shown) ?? numberText(shown) : `${numberText(shown)}/${numberText(display.max ?? shown)}`, ...bounds };
};

export function sheetItem(quality: Quality, values: Readonly<Record<string, PrimitiveValue>>, previous: Readonly<Record<string, PrimitiveValue>> | null): SheetItemView | null {
  const display = quality.display;
  if (!display?.public) return null;
  const value = values[quality.key];
  if (empty(display, value)) return hidesWhenEmpty(display) ? null : { label: display.label, as: display.as, text: "—" };
  const trend = trendOf(quality, value, previous?.[quality.key]);
  const warn = bandWarn(display, value);
  return { label: display.label, as: display.as, ...itemText(quality, display, value as PrimitiveValue), ...(trend ? { trend } : {}), ...(warn ? { warn } : {}) };
}

const authorItem = (quality: Quality, values: Readonly<Record<string, PrimitiveValue>>): SheetItemView => {
  const value = values[quality.key];
  return { label: quality.key, as: "word", text: value === undefined ? "—" : String(value) };
};

export const groupOf = (display: QualityDisplay): string => display.group ?? (display.as === "item" ? INVENTORY_GROUP : STATUS_GROUP);

export function sheetGroups(
  qualities: readonly Quality[], values: Readonly<Record<string, PrimitiveValue>>, previous: Readonly<Record<string, PrimitiveValue>> | null,
  ago?: (quality: Quality) => number | undefined,
  author = false,
): SheetGroupView[] {
  const groups = new Map<string, SheetItemView[]>();
  for (const quality of qualities) {
    const item = quality.display ? sheetItem(quality, values, previous) : author ? authorItem(quality, values) : null;
    if (!item) continue;
    const label = quality.display ? groupOf(quality.display) : STATUS_GROUP;
    const changedAgo = ago?.(quality);
    groups.set(label, [...(groups.get(label) ?? []), changedAgo === undefined ? item : { ...item, changedAgo }]);
  }
  return [...groups].filter(([, items]) => items.length).map(([label, items]) => ({ label, items }));
}

export const previousValues = (log: readonly BoundaryLogEntry[]): Readonly<Record<string, PrimitiveValue>> | null => log.at(-1)?.before.blackboard.values ?? null;

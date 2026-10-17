import { fnv1a } from "./hash";

export const REASONING_REVISION_CAP = 500;

type Row = { is_user?: unknown; is_system?: unknown; send_date?: unknown; swipe_id?: unknown; mes?: unknown; extra?: { reasoning?: unknown } & Record<string, unknown> } | null | undefined;

const rendered = new Map<string, string>();

const keyOf = (row: Row): string | null => {
  if (!row || typeof row !== "object" || row.is_user === true || typeof row.mes !== "string" || typeof row.extra?.reasoning !== "string" || !row.extra.reasoning.trim()) return null;
  return `${String(row.send_date ?? "")}|${typeof row.swipe_id === "number" ? row.swipe_id : 0}`;
};

export function observeRenderedReasoning(row: unknown): void {
  const key = keyOf(row as Row);
  if (!key || rendered.has(key)) return;
  rendered.set(key, fnv1a((row as { mes: string }).mes));
  if (rendered.size > REASONING_REVISION_CAP) rendered.delete(rendered.keys().next().value as string);
}

export function reasoningStale(row: unknown): boolean {
  const key = keyOf(row as Row);
  const known = key ? rendered.get(key) : undefined;
  return known !== undefined && known !== fnv1a((row as { mes: string }).mes);
}

export const withoutStaleReasoning = (rows: unknown[]): unknown[] => rows.map((row) => {
  if (!reasoningStale(row)) return row;
  const { reasoning: _dropped, ...extra } = (row as { extra: Record<string, unknown> }).extra;
  return { ...(row as object), extra };
});

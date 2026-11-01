import { isRecord } from "@utils/guards";

const sortedKeys = (_key: string, inner: unknown): unknown =>
  (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : inner);

const canonical = (value: unknown): string | undefined => (value === undefined ? undefined : JSON.stringify(value, sortedKeys));

export type LoreEntries = Record<string, unknown>;

export interface LorebookMerge {
  entries: LoreEntries;
  conflicts: string[];
  moved: Array<{ from: string; to: string }>;
}

const labelOf = (uid: string, ...entries: unknown[]): string => {
  for (const entry of entries) {
    const comment = entry && typeof entry === "object" ? String((entry as { comment?: unknown }).comment ?? "").trim() : "";
    if (comment) return `"${comment}"`;
  }
  return `entry ${uid}`;
};

const nextUid = (taken: Set<string>): string => {
  let uid = Math.max(-1, ...[...taken].map(Number).filter(Number.isInteger)) + 1;
  while (taken.has(String(uid))) uid += 1;
  return String(uid);
};

// ST's editor writes every field it draws back into the entry (world-info.js getWorldEntry, `noSave`
// inputs), so an entry the author never touched still differs from the copy it was drawn from. Two
// changed copies of one entry are merged field by field; only a field both changed is a conflict.
function mergeFields(base: Record<string, unknown>, mine: Record<string, unknown>, theirs: Record<string, unknown>): { value: Record<string, unknown>; clashed: boolean } {
  const value: Record<string, unknown> = {};
  let clashed = false;
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const [b, m, t] = [canonical(base[key]), canonical(mine[key]), canonical(theirs[key])];
    const kept = m === t || t === b ? mine[key] : m === b ? theirs[key] : mine[key];
    if (m !== t && t !== b && m !== b) clashed = true;
    if (kept !== undefined) value[key] = kept;
  }
  return { value, clashed };
}

const byUid = (a: string, b: string): number => {
  const [x, y] = [Number(a), Number(b)];
  return Number.isInteger(x) && Number.isInteger(y) ? x - y : a < b ? -1 : a > b ? 1 : 0;
};

export function mergeLorebookEntries(base: LoreEntries, mine: LoreEntries, theirs: LoreEntries): LorebookMerge {
  const entries: LoreEntries = {};
  const conflicts: string[] = [];
  const moved: Array<{ from: string; to: string }> = [];
  const uids = [...new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])].sort(byUid);
  const taken = new Set(uids);
  const relocate: Array<{ uid: string; entry: unknown }> = [];
  for (const uid of uids) {
    const [b, m, t] = [canonical(base[uid]), canonical(mine[uid]), canonical(theirs[uid])];
    const keep = m === t || t === b ? mine[uid] : m === b ? theirs[uid] : undefined;
    if (m === t || t === b || m === b) {
      if (keep !== undefined) entries[uid] = keep;
      continue;
    }
    if (isRecord(base[uid]) && isRecord(mine[uid]) && isRecord(theirs[uid])) {
      const fields = mergeFields(base[uid] as Record<string, unknown>, mine[uid] as Record<string, unknown>, theirs[uid] as Record<string, unknown>);
      entries[uid] = fields.value;
      if (fields.clashed) conflicts.push(labelOf(uid, mine[uid], theirs[uid], base[uid]));
      continue;
    }
    entries[uid] = m === undefined ? theirs[uid] : mine[uid];
    if (b === undefined && m !== undefined && t !== undefined) relocate.push({ uid, entry: theirs[uid] });
    else conflicts.push(labelOf(uid, mine[uid], theirs[uid], base[uid]));
  }
  for (const { uid, entry } of relocate) {
    const to = nextUid(taken);
    taken.add(to);
    entries[to] = entry && typeof entry === "object" ? { ...entry, uid: Number(to) } : entry;
    moved.push({ from: uid, to });
  }
  return { entries, conflicts, moved };
}

import { isRecord } from "@utils/guards";
import { fnv1a, stableStringify } from "@runtime/hash";

export interface ProposalBase {
  units: Record<string, string>;
  touched: string[];
}

type Segment = string | { key: string };

const MAX_DEPTH = 4;

const entryKey = (entry: unknown): string | null => {
  if (!isRecord(entry)) return null;
  if (typeof entry.id === "string") return `id:${entry.id}`;
  if (typeof entry.key === "string") return `key:${entry.key}`;
  if (typeof entry.from === "string" && typeof entry.to === "string") return `edge:${entry.from}->${entry.to}`;
  return null;
};

const keyedEntries = (list: unknown[]): Map<string, unknown> | null => {
  const keyed = new Map<string, unknown>();
  for (const entry of list) {
    const key = entryKey(entry);
    if (key === null || keyed.has(key)) return null;
    keyed.set(key, entry);
  }
  return keyed.size ? keyed : null;
};

const hashOf = (value: unknown): string => fnv1a(stableStringify(value ?? null));

const collect = (value: unknown, path: Segment[], inEntity: boolean, out: Map<string, string>): void => {
  const keyed = Array.isArray(value) && !inEntity ? keyedEntries(value) : null;
  if (path.length < MAX_DEPTH && keyed) {
    for (const [key, entry] of keyed) collect(entry, [...path, { key }], true, out);
    return;
  }
  const atEntityField = inEntity && typeof path.at(-1) === "string";
  if (path.length < MAX_DEPTH && isRecord(value) && !atEntityField) {
    for (const [field, inner] of Object.entries(value)) collect(inner, [...path, field], inEntity, out);
    return;
  }
  out.set(JSON.stringify(path), hashOf(value));
};

const unitsOf = (draft: object): Map<string, string> => {
  const out = new Map<string, string>();
  collect(draft, [], false, out);
  return out;
};

const valueAt = (root: unknown, path: Segment[]): unknown => path.reduce<unknown>((value, segment) => {
  if (typeof segment === "string") return isRecord(value) ? value[segment] : undefined;
  return Array.isArray(value) ? value.find((entry) => entryKey(entry) === segment.key) : undefined;
}, root);

const prefixOf = (prefix: Segment[], path: Segment[]): boolean =>
  prefix.length < path.length && prefix.every((segment, index) => JSON.stringify(segment) === JSON.stringify(path[index]));

const hashIn = (base: Record<string, string>, pathKey: string): string | null => {
  if (pathKey in base) return base[pathKey];
  const path = JSON.parse(pathKey) as Segment[];
  const covered = Object.keys(base).some((key) => prefixOf(JSON.parse(key) as Segment[], path));
  return covered ? null : hashOf(undefined);
};

const changedUnits = (base: Record<string, string>, draft: object): string[] => {
  const current = unitsOf(draft);
  const keys = new Set([...Object.keys(base), ...current.keys()]);
  return [...keys].filter((key) => {
    const before = hashIn(base, key);
    return before !== null && before !== hashOf(valueAt(draft, JSON.parse(key) as Segment[]));
  });
};

export const proposalBase = (before: object, after: object): ProposalBase => {
  const units = Object.fromEntries(unitsOf(before));
  return { units, touched: changedUnits(units, after) };
};

const label = (pathKey: string): string => {
  const path = JSON.parse(pathKey) as Segment[];
  return path.length ? path.map((segment) => (typeof segment === "string" ? segment : segment.key.replace(/^[a-z]+:/, ""))).join(".") : "the story";
};

export const changedSinceProposed = (base: ProposalBase | undefined, draft: object, applied?: object): string[] => {
  if (!base) return [];
  const authored = changedUnits(base.units, draft);
  const stale = authored.filter((key) => base.touched.includes(key));
  const overwritten = applied ? authored.filter((key) => hashOf(valueAt(applied, JSON.parse(key) as Segment[])) !== hashOf(valueAt(draft, JSON.parse(key) as Segment[]))) : [];
  return [...new Set([...stale, ...overwritten])].map(label);
};

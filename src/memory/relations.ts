import type { LedgerEntry, LedgerView } from "./types";

export const RELATION_FIELD_PREFIX = "rel:";
export const RELATION_ENDED_VALUE = "ended";
export const RELATION_SYMMETRIC: ReadonlySet<string> = new Set(["ally_of", "enemy_of", "married_to", "rival_of", "friend_of", "sibling_of", "partner_of"]);
export const RELATION_OPPOSITES: ReadonlyArray<readonly [string, string]> = [
  ["trusts", "distrusts"], ["ally_of", "enemy_of"], ["friend_of", "enemy_of"], ["loves", "hates"], ["serves", "opposes"], ["likes", "dislikes"],
];

export const relationField = (relation: string, object: string): string => `${RELATION_FIELD_PREFIX}${relation}:${object.trim()}`;

export const opposite = (left: string, right: string): boolean =>
  RELATION_OPPOSITES.some(([a, b]) => (a === left && b === right) || (a === right && b === left));

const fold = (value: string) => value.trim().toLowerCase();

export interface RelationConflict {
  key: string;
  rows: [LedgerEntry, LedgerEntry];
}

export function relationConflicts(rows: readonly LedgerEntry[]): RelationConflict[] {
  const active = rows.filter((row) => row.relation && row.object && row.value !== RELATION_ENDED_VALUE);
  const found: RelationConflict[] = [];
  active.forEach((left, at) => active.slice(at + 1).forEach((right) => {
    if (!opposite(left.relation as string, right.relation as string)) return;
    const [ls, lo, rs, ro] = [fold(left.entity), fold(left.object as string), fold(right.entity), fold(right.object as string)];
    const direct = ls === rs && lo === ro;
    const mirrored = ls === ro && lo === rs && RELATION_SYMMETRIC.has(left.relation as string) && RELATION_SYMMETRIC.has(right.relation as string);
    if (direct || mirrored) found.push({ key: `rel:${[left.id, right.id].sort().join(":")}`, rows: [left, right] });
  }));
  return found;
}

export const relationLabel = (row: Pick<LedgerEntry, "entity" | "relation" | "object" | "value">): string =>
  `${row.entity} ${row.value === RELATION_ENDED_VALUE ? "no longer " : ""}${(row.relation ?? "").replace(/_/g, " ")} ${row.object ?? ""}`.trim();

export const renderRelationField = (row: Pick<LedgerView, "relation" | "object" | "value">): string | null =>
  (row.relation && row.value !== RELATION_ENDED_VALUE ? `${row.relation.replace(/_/g, " ")} ${row.object ?? ""}`.trim() : null);

import type { RosterMember } from "./schema";

type Named = Pick<RosterMember, "id" | "name">;

const fold = (text: string) => text.trim().toLowerCase();

export const castCardName = (member: Named): string => member.name ?? member.id;

export const castMemberName = (roster: readonly Named[], identifier: string): string => {
  const wanted = fold(identifier);
  if (!wanted || roster.some((member) => fold(castCardName(member)) === wanted)) return identifier;
  const byId = roster.find((member) => fold(member.id) === wanted);
  return byId ? castCardName(byId) : identifier;
};

export const isCastMember = (roster: readonly Named[], identifier: string): boolean => {
  const wanted = fold(identifier);
  return Boolean(wanted) && roster.some((member) => fold(castCardName(member)) === wanted || fold(member.id) === wanted);
};

export const castMemberNames = (roster: readonly Named[], identifiers: readonly string[]): string[] => identifiers
  .map((identifier) => castMemberName(roster, identifier))
  .filter((name, index, list) => list.findIndex((entry) => fold(entry) === fold(name)) === index);

export interface CastChangeNames {
  enable?: string[];
  disable?: string[];
}

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return value.trim() ? [value] : [];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
};

export const resolveCastChanges = (roster: readonly Named[], value: unknown): { changes: CastChangeNames; resolved: string[] } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const resolved: string[] = [];
  const side = (list: unknown) => strings(list).map((identifier) => {
    const name = castMemberName(roster, identifier);
    if (name !== identifier) resolved.push(`${identifier} → ${name}`);
    return name;
  });
  return { changes: { ...record, ...(record.enable !== undefined ? { enable: side(record.enable) } : {}), ...(record.disable !== undefined ? { disable: side(record.disable) } : {}) }, resolved };
};

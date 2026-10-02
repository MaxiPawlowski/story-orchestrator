import { resolveCastChanges, type NormalizedStoryV2 } from "@engine/index";

export const CAST_UNRESOLVED = "cast change names no member of this group";
export const CAST_UNRESOLVED_NOTE = "no group member has that card name and no cast member has that id, so they were left as they are";

const names = (value: unknown): string[] => (Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);

export interface CastPlan {
  disable: string[];
  changes: Array<[string, boolean]>;
  unknown: string[];
}

export const planCastChanges = (roster: NormalizedStoryV2["roster"], authored: unknown, known: (name: string) => boolean): CastPlan | null => {
  const value = resolveCastChanges(roster, authored)?.changes;
  if (!value) return null;
  const disable = names(value.disable);
  const enable = names(value.enable);
  return {
    disable,
    changes: [...disable.map((name): [string, boolean] => [name, true]), ...enable.map((name): [string, boolean] => [name, false])],
    unknown: [...disable, ...enable].filter((name) => !known(name)),
  };
};

const backgroundStem = (name: unknown) => String(name ?? "").trim().toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "");

export const holdsBackground = (before: Record<string, unknown> | null, name: string): boolean =>
  Boolean(before && backgroundStem(before.name) && backgroundStem(before.name) === backgroundStem(name));

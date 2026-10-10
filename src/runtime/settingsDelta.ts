import { isRecord } from "@utils/guards";

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

export const overDefaults = (defaults: unknown, stored: unknown): unknown => {
  if (stored === undefined) return defaults;
  if (!isRecord(defaults) || !isRecord(stored)) return stored;
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(stored)) merged[key] = overDefaults(defaults[key], value);
  return merged;
};

export const deltaFrom = (defaults: unknown, value: unknown): unknown => {
  if (value === undefined || same(value, defaults)) return undefined;
  if (!isRecord(value) || !isRecord(defaults)) return value;
  const delta: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const changed = deltaFrom(defaults[key], entry);
    if (changed !== undefined) delta[key] = changed;
  }
  return Object.keys(delta).length ? delta : undefined;
};

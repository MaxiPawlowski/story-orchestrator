import { isRecord } from "@utils/guards";

export interface SpriteLabel {
  what: string;
  notFor: string;
  examples: string[];
  fallback: string[];
}

export interface SpriteProfile {
  folder: string;
  default: string;
  labels: Record<string, SpriteLabel>;
  localMap: Record<string, string>;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export function readSpriteProfile(value: unknown, fallbackFolder: string): SpriteProfile | null {
  if (!isRecord(value) || !isRecord(value.labels)) return null;
  const labels: Record<string, SpriteLabel> = {};
  for (const [id, raw] of Object.entries(value.labels)) {
    if (!isRecord(raw) || !/^[a-z0-9_]+$/.test(id)) continue;
    labels[id] = {
      what: typeof raw.what === "string" ? raw.what : id,
      notFor: typeof raw.not_for === "string" ? raw.not_for : "",
      examples: strings(raw.examples),
      fallback: strings(raw.fallback),
    };
  }
  if (!Object.keys(labels).length) return null;
  const localMap = isRecord(value.local_map)
    ? Object.fromEntries(Object.entries(value.local_map).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const folder = typeof value.folder === "string" && value.folder.trim() ? value.folder.trim() : fallbackFolder;
  const fallback = typeof value.default === "string" && labels[value.default] ? value.default : Object.keys(labels)[0];
  return { folder, default: fallback, labels, localMap };
}

export interface SpriteFile {
  label: string;
  path: string;
}

export function spriteIndex(files: SpriteFile[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) if (!index.has(file.label)) index.set(file.label, file.path);
  return index;
}

export function resolveSprite(profile: SpriteProfile, label: string, available: Map<string, string>): { label: string; path: string } | null {
  const seen = new Set<string>();
  const queue = [label];
  while (queue.length) {
    const next = queue.shift() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    const path = available.get(next);
    if (path) return { label: next, path };
    queue.push(...(profile.labels[next]?.fallback ?? []));
  }
  const path = available.get(profile.default);
  return path ? { label: profile.default, path } : null;
}

export function unionLabels(profiles: SpriteProfile[]): Record<string, SpriteLabel> {
  const out: Record<string, SpriteLabel> = {};
  for (const profile of profiles) for (const [id, label] of Object.entries(profile.labels)) out[id] ??= label;
  return out;
}

export interface SpriteSetRule {
  id: string;
  places: string[];
  checkpoints: string[];
  keywords: string[];
}

export function readSpriteSets(value: unknown): SpriteSetRule[] {
  const raw = isRecord(value) && Array.isArray(value.sets) ? value.sets : [];
  const sets = raw.flatMap((entry): SpriteSetRule[] => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !/^[a-z0-9_]+$/.test(entry.id)) return [];
    const when = isRecord(entry.when) ? entry.when : {};
    return [{ id: entry.id, places: strings(when.places), checkpoints: strings(when.checkpoints), keywords: strings(when.keywords) }];
  });
  return sets.some((entry) => entry.id === "default") ? sets : [{ id: "default", places: [], checkpoints: [], keywords: [] }, ...sets];
}

export interface SetContext {
  location: string | null;
  checkpoint: string | null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function placeSet(sets: SpriteSetRule[], context: SetContext): string {
  const byCheckpoint = context.checkpoint ? sets.find((entry) => entry.checkpoints.some((id) => same(id, context.checkpoint as string))) : undefined;
  if (byCheckpoint) return byCheckpoint.id;
  const byPlace = context.location ? sets.find((entry) => entry.places.some((place) => same(place, context.location as string))) : undefined;
  return byPlace?.id ?? "default";
}

export function keywordSet(sets: SpriteSetRule[], text: string): string | null {
  const words = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ")} `;
  const hit = sets.find((entry) => entry.id !== "default" && entry.keywords.some((word) => {
    const needle = word.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ").trim();
    return needle.length > 0 && words.includes(` ${needle} `);
  }));
  return hit?.id ?? null;
}

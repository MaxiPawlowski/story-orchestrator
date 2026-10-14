import { isRecord } from "@utils/guards";
import type { HeadBox } from "./builder/pixels";
import type { LiveHeadRef } from "./liveHeadRefs";

export interface VisualAsset {
  path: string; sha256: string; key: string; recipe: { id: string; version: number };
}
export interface VisualLook {
  root: string; signature: string; base: VisualAsset; bust?: VisualAsset;
}
export interface VisualManifest {
  id: string; revision: number; character: string; card: { path: string; sha256: string };
  baseSet: string; base: VisualAsset; bust: VisualAsset; box: HeadBox; looks: Record<string, VisualLook>;
}
export type VisualSources = Record<string, VisualManifest>;
export const visualRoot = (source: Pick<VisualManifest, "id" | "revision">): string => `${source.id}:${source.revision}`;
export const servedAsset = <T extends { path: string }>(value: T): T => ({ ...value, path: value.path.split("?")[0] });
export const lookSignature = (fields: Record<string, string>): string => JSON.stringify(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)));
export const visualHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const visualPath = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.startsWith("/characters/") || value.length > 2048) return false;
  try { const decoded = decodeURIComponent(value);
    return !/[\\?#]/.test(decoded) && [...decoded].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      && !decoded.split("/").includes(".."); }
  catch { return false; }
};
const asset = (value: unknown): value is VisualAsset => isRecord(value) && visualPath(value.path) && visualHash(value.sha256)
  && typeof value.key === "string" && value.key.length > 0 && value.key.length <= 2048 && isRecord(value.recipe)
  && typeof value.recipe.id === "string" && value.recipe.id.length > 0 && Number.isInteger(value.recipe.version) && Number(value.recipe.version) > 0;

export function visualSources(value: unknown): VisualSources {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 256).flatMap(([character, row]) => {
    if (!isRecord(row) || row.character !== character || !visualHash(row.id) || !Number.isInteger(row.revision) || Number(row.revision) < 1
      || !isRecord(row.card) || !visualPath(row.card.path) || !visualHash(row.card.sha256) || !asset(row.base) || !asset(row.bust)
      || typeof row.baseSet !== "string" || !/^[a-z0-9_]{1,80}$/.test(row.baseSet) || !isRecord(row.box)
      || ![row.box.x, row.box.y, row.box.width, row.box.height].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 8192)
      || Number(row.box.width) < 8 || Number(row.box.height) < 8 || !isRecord(row.looks)) return [];
    const root = visualRoot({ id: row.id, revision: Number(row.revision) });
    const looks = Object.fromEntries(Object.entries(row.looks).slice(0, 128).flatMap(([set, look]) => {
      if (!isRecord(look) || look.root !== root || typeof look.signature !== "string" || look.signature.length > 20000 || !asset(look.base)
        || (look.bust !== undefined && !asset(look.bust))) return [];
      return [[set, { root, signature: look.signature, base: look.base, ...(look.bust ? { bust: look.bust } : {}) }]];
    }));
    if (looks.default?.base.sha256 !== row.base.sha256 || looks.default?.bust?.sha256 !== row.bust.sha256) return [];
    return [[character, { id: row.id, revision: Number(row.revision), character, card: { path: row.card.path, sha256: row.card.sha256 },
      baseSet: row.baseSet, base: row.base, bust: row.bust,
      box: { x: Number(row.box.x), y: Number(row.box.y), width: Number(row.box.width), height: Number(row.box.height) }, looks }]];
  }));
}

export function currentVisual(source: VisualManifest, signature: string): VisualLook | null {
  const matches = Object.values(source.looks).filter((look) => look.root === visualRoot(source) && look.signature === signature);
  const hashes = new Set(matches.map((look) => look.base.sha256));
  return matches.length && hashes.size === 1 ? matches.at(-1) ?? null : null;
}

export function publishVisualLook(source: VisualManifest, root: string, set: string, signature: string, served: VisualAsset): VisualManifest {
  const base = servedAsset(served);
  if (visualRoot(source) !== root) throw new Error("The accepted visual source changed. Prepare this look again.");
  if (!asset(base)) throw new Error("The changed-look artifact is incomplete.");
  const looks = { ...source.looks, [set]: { root, signature, base } };
  return { ...source, looks: Object.fromEntries(Object.entries(looks).filter(([key]) => key === "default" || key === set || Object.keys(looks).indexOf(key) > Object.keys(looks).length - 128)) };
}

export function visualHead(source: VisualManifest | undefined, look: string, member: string, refs: Record<string, LiveHeadRef>) {
  const selected = source?.looks[look];
  if (!source || !selected || selected.root !== visualRoot(source)) return { state: "missing-source" as const };
  if (!selected.bust) return { state: "pending-bust" as const };
  const bust = selected.bust;
  const matches = Object.values(refs).filter((ref) => ref.member === member && ref.look === look && ref.source === bust.path && ref.artHash === bust.sha256);
  return { state: matches.length === 1 ? "ready" as const : "pending-rig" as const, bust: selected.bust, rig: matches.length === 1 ? matches[0] : undefined };
}

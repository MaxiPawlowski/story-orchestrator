import { isRecord } from "@utils/guards";
import type { HeadBox } from "./builder/pixels";

export interface VisualAsset {
  path: string; sha256: string; key: string; recipe: { id: string; version: number };
}
export interface VisualLook {
  root: string; signature: string; base: VisualAsset; bust?: VisualAsset;
}
export const REFERENCE_VIEWS = ["full_body", "front", "three_quarter_left", "three_quarter_right", "profile", "back"] as const;
export type ReferenceView = (typeof REFERENCE_VIEWS)[number];
export interface ReferencePack { hash: string; views: Record<ReferenceView, VisualAsset> }
export interface VisualManifest {
  id: string; revision: number; character: string; card: { path: string; sha256: string };
  baseSet: string; base: VisualAsset; bust: VisualAsset; box: HeadBox; looks: Record<string, VisualLook>; pack?: ReferencePack;
}
export type VisualSources = Record<string, VisualManifest>;
export const visualRoot = (source: Pick<VisualManifest, "id" | "revision"> & { pack?: Pick<ReferencePack, "hash"> }): string =>
  `${source.id}:${source.revision}${source.pack ? `:${source.pack.hash.slice(0, 16)}` : ""}`;
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
export const isVisualAsset = (value: unknown): value is VisualAsset => isRecord(value) && visualPath(value.path) && visualHash(value.sha256)
  && typeof value.key === "string" && value.key.length > 0 && value.key.length <= 2048 && isRecord(value.recipe)
  && typeof value.recipe.id === "string" && value.recipe.id.length > 0 && Number.isInteger(value.recipe.version) && Number(value.recipe.version) > 0;

function referencePack(value: unknown, base: VisualAsset, bust: VisualAsset): ReferencePack | null {
  if (!isRecord(value) || !visualHash(value.hash) || !isRecord(value.views)) return null;
  const views = value.views;
  if (Object.keys(views).length !== REFERENCE_VIEWS.length || !REFERENCE_VIEWS.every((view) => isVisualAsset(views[view]))) return null;
  const typed = views as Record<ReferenceView, VisualAsset>;
  if (typed.full_body.sha256 !== base.sha256 || typed.front.sha256 !== bust.sha256) return null;
  return { hash: value.hash, views: Object.fromEntries(REFERENCE_VIEWS.map((view) => [view, { ...typed[view], recipe: { ...typed[view].recipe } }])) as Record<ReferenceView, VisualAsset> };
}

export function visualSources(value: unknown): VisualSources {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 256).flatMap(([character, row]) => {
    if (!isRecord(row) || row.character !== character || !visualHash(row.id) || !Number.isInteger(row.revision) || Number(row.revision) < 1
      || !isRecord(row.card) || !visualPath(row.card.path) || !visualHash(row.card.sha256) || !isVisualAsset(row.base) || !isVisualAsset(row.bust)
      || typeof row.baseSet !== "string" || !/^[a-z0-9_]{1,80}$/.test(row.baseSet) || !isRecord(row.box)
      || ![row.box.x, row.box.y, row.box.width, row.box.height].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 8192)
      || Number(row.box.width) < 8 || Number(row.box.height) < 8 || !isRecord(row.looks)) return [];
    const pack = row.pack === undefined ? undefined : referencePack(row.pack, row.base, row.bust);
    if (pack === null) return [];
    const root = visualRoot({ id: row.id, revision: Number(row.revision), pack });
    const looks = Object.fromEntries(Object.entries(row.looks).slice(0, 128).flatMap(([set, look]) => {
      if (!isRecord(look) || look.root !== root || typeof look.signature !== "string" || look.signature.length > 20000 || !isVisualAsset(look.base)
        || (look.bust !== undefined && !isVisualAsset(look.bust))) return [];
      return [[set, { root, signature: look.signature, base: look.base, ...(look.bust ? { bust: look.bust } : {}) }]];
    }));
    if (looks.default?.base.sha256 !== row.base.sha256 || looks.default?.bust?.sha256 !== row.bust.sha256) return [];
    return [[character, { id: row.id, revision: Number(row.revision), character, card: { path: row.card.path, sha256: row.card.sha256 },
      baseSet: row.baseSet, base: row.base, bust: row.bust,
      box: { x: Number(row.box.x), y: Number(row.box.y), width: Number(row.box.width), height: Number(row.box.height) }, looks, ...(pack ? { pack } : {}) }]];
  }));
}

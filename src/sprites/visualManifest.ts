import { isRecord } from "@utils/guards";
import type { HeadBox } from "./builder/pixels";
import type { LiveHeadRef } from "./liveHeadRefs";

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
const asset = (value: unknown): value is VisualAsset => isRecord(value) && visualPath(value.path) && visualHash(value.sha256)
  && typeof value.key === "string" && value.key.length > 0 && value.key.length <= 2048 && isRecord(value.recipe)
  && typeof value.recipe.id === "string" && value.recipe.id.length > 0 && Number.isInteger(value.recipe.version) && Number(value.recipe.version) > 0;

function referencePack(value: unknown, base: VisualAsset, bust: VisualAsset): ReferencePack | null {
  if (!isRecord(value) || !visualHash(value.hash) || !isRecord(value.views)) return null;
  const views = value.views;
  if (Object.keys(views).length !== REFERENCE_VIEWS.length || !REFERENCE_VIEWS.every((view) => asset(views[view]))) return null;
  const typed = views as Record<ReferenceView, VisualAsset>;
  if (typed.full_body.sha256 !== base.sha256 || typed.front.sha256 !== bust.sha256) return null;
  return { hash: value.hash, views: Object.fromEntries(REFERENCE_VIEWS.map((view) => [view, { ...typed[view], recipe: { ...typed[view].recipe } }])) as Record<ReferenceView, VisualAsset> };
}

export function visualSources(value: unknown): VisualSources {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 256).flatMap(([character, row]) => {
    if (!isRecord(row) || row.character !== character || !visualHash(row.id) || !Number.isInteger(row.revision) || Number(row.revision) < 1
      || !isRecord(row.card) || !visualPath(row.card.path) || !visualHash(row.card.sha256) || !asset(row.base) || !asset(row.bust)
      || typeof row.baseSet !== "string" || !/^[a-z0-9_]{1,80}$/.test(row.baseSet) || !isRecord(row.box)
      || ![row.box.x, row.box.y, row.box.width, row.box.height].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 8192)
      || Number(row.box.width) < 8 || Number(row.box.height) < 8 || !isRecord(row.looks)) return [];
    const pack = row.pack === undefined ? undefined : referencePack(row.pack, row.base, row.bust);
    if (pack === null) return [];
    const root = visualRoot({ id: row.id, revision: Number(row.revision), pack });
    const looks = Object.fromEntries(Object.entries(row.looks).slice(0, 128).flatMap(([set, look]) => {
      if (!isRecord(look) || look.root !== root || typeof look.signature !== "string" || look.signature.length > 20000 || !asset(look.base)
        || (look.bust !== undefined && !asset(look.bust))) return [];
      return [[set, { root, signature: look.signature, base: look.base, ...(look.bust ? { bust: look.bust } : {}) }]];
    }));
    if (looks.default?.base.sha256 !== row.base.sha256 || looks.default?.bust?.sha256 !== row.bust.sha256) return [];
    return [[character, { id: row.id, revision: Number(row.revision), character, card: { path: row.card.path, sha256: row.card.sha256 },
      baseSet: row.baseSet, base: row.base, bust: row.bust,
      box: { x: Number(row.box.x), y: Number(row.box.y), width: Number(row.box.width), height: Number(row.box.height) }, looks, ...(pack ? { pack } : {}) }]];
  }));
}

export interface VisualChoice { set: string; look: VisualLook; shadowed: string[] }

export function visualChoice(source: VisualManifest, signature: string): VisualChoice | null {
  const root = visualRoot(source);
  const matches = Object.entries(source.looks).filter(([, look]) => look.root === root && look.signature === signature);
  const chosen = matches.at(-1);
  return chosen ? { set: chosen[0], look: chosen[1], shadowed: matches.slice(0, -1).map(([set]) => set) } : null;
}

export const currentVisual = (source: VisualManifest, signature: string): VisualLook | null => visualChoice(source, signature)?.look ?? null;

export function publishedLook(source: VisualManifest, fields: Record<string, string>): { set: string; path: string; sha256: string } | null {
  if (!Object.keys(fields).length) return null;
  const choice = visualChoice(source, lookSignature(fields));
  return choice && choice.set !== "default" ? { set: choice.set, path: choice.look.base.path, sha256: choice.look.base.sha256 } : null;
}

const LOOK_FILLER = new Set(["a", "an", "the", "and", "with", "over", "under", "of", "in", "on", "her", "his", "their"]);
const lookWords = (value: string): Set<string> => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !LOOK_FILLER.has(word)));
export const NEAREST_LOOK_MIN = 0.5;

export function lookOverlap(a: Record<string, string>, b: Record<string, string>): number {
  const keys = Object.keys(a);
  if (!keys.length || keys.length !== Object.keys(b).length || keys.some((key) => !(key in b))) return 0;
  return keys.reduce((sum, key) => {
    const left = lookWords(a[key]), right = lookWords(b[key]);
    const shared = [...left].filter((word) => right.has(word)).length, union = new Set([...left, ...right]).size;
    return sum + (union ? shared / union : 0);
  }, 0) / keys.length;
}

export function nearestLook(source: VisualManifest, fields: Record<string, string>): { set: string; path: string } | null {
  let best: { set: string; path: string; score: number } | null = null;
  for (const [set, look] of Object.entries(source.looks)) {
    if (set === "default" || look.root !== visualRoot(source)) continue;
    const parsed = parseSignature(look.signature);
    const score = parsed ? lookOverlap(fields, parsed) : 0;
    if (score >= NEAREST_LOOK_MIN && (!best || score > best.score)) best = { set, path: look.base.path, score };
  }
  return best && { set: best.set, path: best.path };
}

function parseSignature(signature: string): Record<string, string> | null {
  try {
    const rows: unknown = JSON.parse(signature);
    return Array.isArray(rows) && rows.every((row) => Array.isArray(row) && row.length === 2 && row.every((cell) => typeof cell === "string"))
      ? Object.fromEntries(rows as Array<[string, string]>) : null;
  } catch { return null; }
}

export function publishVisualLook(source: VisualManifest, root: string, set: string, signature: string, served: VisualAsset): VisualManifest {
  const base = servedAsset(served);
  if (visualRoot(source) !== root) throw new Error("The accepted visual source changed. Prepare this look again.");
  if (!asset(base)) throw new Error("The changed-look artifact is incomplete.");
  const previous = source.looks[set];
  const kept = previous?.bust && previous.root === root && previous.signature === signature && previous.base.sha256 === base.sha256
    && previous.base.path === base.path ? { bust: previous.bust } : {};
  const looks = { ...source.looks, [set]: { root, signature, base, ...kept } };
  return { ...source, looks: Object.fromEntries(Object.entries(looks).filter(([key]) => key === "default" || key === set || Object.keys(looks).indexOf(key) > Object.keys(looks).length - 128)) };
}

export function withReferencePack(source: VisualManifest, root: string, pack: ReferencePack): VisualManifest {
  if (visualRoot(source) !== root) throw new Error("The accepted visual source changed. Prepare the reference views again.");
  const views = Object.fromEntries(REFERENCE_VIEWS.map((view) => [view, servedAsset(pack.views[view])])) as Record<ReferenceView, VisualAsset>;
  const next = { ...source, revision: source.revision + 1, pack: { hash: pack.hash, views } };
  return { ...next, looks: { default: { ...source.looks.default, root: visualRoot(next) } } };
}

export function visualHead(source: VisualManifest | undefined, look: string, member: string, refs: Record<string, LiveHeadRef>) {
  const selected = source?.looks[look];
  if (!source || !selected || selected.root !== visualRoot(source)) return { state: "missing-source" as const };
  if (!selected.bust) return { state: "pending-bust" as const };
  const bust = selected.bust;
  const matches = Object.values(refs).filter((ref) => ref.member === member && ref.look === look && ref.source === bust.path && ref.artHash === bust.sha256);
  return { state: matches.length === 1 ? "ready" as const : "pending-rig" as const, bust: selected.bust, rig: matches.length === 1 ? matches[0] : undefined };
}

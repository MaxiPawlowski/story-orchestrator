import type { LiveHeadRef } from "./liveHeadRefs";
import {
  isVisualAsset, lookSignature, REFERENCE_VIEWS, servedAsset, visualRoot, type ReferencePack, type ReferenceView, type VisualAsset, type VisualLook, type VisualManifest,
} from "./visualSources";

export * from "./visualSources";

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
  if (!isVisualAsset(base)) throw new Error("The changed-look artifact is incomplete.");
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

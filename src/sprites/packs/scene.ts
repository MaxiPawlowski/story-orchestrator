import { cardValues } from "@engine/cardFields";
import type { NormalizedStory, PrimitiveValue, VisualPackRef } from "@engine/index";
import { stableStringify } from "@runtime/hash";
import { lookSignature } from "../visualManifest";
import { newerRevision, type PackCatalog } from "./catalog";
import { packAsset, packKey, packRef, type IdentityPack, type PackAsset, type PlacePack, type QaStatus, type StylePack, type StyleRecipe, type VisualPack } from "./pack";

export type VisualFallback = "unbound" | "pack-missing" | "pack-kind" | "asset-mismatch" | "look-missing";
export interface SceneFile { path: string; sha256: string }
export interface SceneSubject {
  member: string; name: string; source: "pack" | "none"; fallback?: VisualFallback; pack?: VisualPackRef; qa?: QaStatus; newer?: VisualPackRef;
  intended: { look: string | null; fields: Record<string, string>; signature: string };
  displayed?: { look: string; base: SceneFile; bust?: SceneFile };
  substituted: boolean; tags: string[];
}
export interface ScenePlace {
  checkpoint: string | null; source: "pack" | "none"; fallback?: VisualFallback; pack?: VisualPackRef; qa?: QaStatus; newer?: VisualPackRef;
  variant?: string; plate?: SceneFile; name: string | null; description?: string; tags: string[];
}
export interface SceneStyle { source: "pack" | "none"; fallback?: VisualFallback; pack?: VisualPackRef; target?: string; recipe?: StyleRecipe }
export interface VisualScene { subjects: SceneSubject[]; place: ScenePlace; style: SceneStyle; packs: string[]; dependencies: SceneFile[]; key: string }

export type SceneStory = Pick<NormalizedStory, "illustrations" | "roster" | "cardFieldByQuality" | "checkpointById">;
export interface SceneInput {
  story: SceneStory; members: readonly string[]; values: Record<string, PrimitiveValue>; path: readonly string[];
  catalog: PackCatalog; verified: (asset: PackAsset) => boolean; family?: string;
}

const file = (asset: PackAsset): SceneFile => ({ path: asset.path, sha256: asset.sha256 });

function bound<K extends VisualPack["kind"]>(catalog: PackCatalog, ref: VisualPackRef | undefined, kind: K):
  { pack: Extract<VisualPack, { kind: K }> } | { fallback: VisualFallback; newer?: VisualPackRef } {
  if (!ref) return { fallback: "unbound" };
  const pack = catalog.packs.get(packKey(ref));
  const newer = newerRevision(catalog, ref);
  if (!pack) return { fallback: "pack-missing", ...(newer ? { newer: packRef(newer) } : {}) };
  return pack.kind === kind ? { pack: pack as Extract<VisualPack, { kind: K }> } : { fallback: "pack-kind" };
}

const lookImages = (pack: IdentityPack, look: string, verified: SceneInput["verified"]) => {
  const entry = pack.looks[look], base = packAsset(pack, entry.base), bust = entry.bust ? packAsset(pack, entry.bust) : undefined;
  if (!base || !verified(base)) return null;
  return { look, base: file(base), ...(bust && verified(bust) ? { bust: file(bust) } : {}) };
};

export const identityTags = (pack: IdentityPack, family?: string): string[] =>
  (family && pack.tagsByFamily[family]) || pack.tagsByFamily.default || pack.traits;

function subject(input: SceneInput, memberId: string): SceneSubject | null {
  const member = input.story.roster.find((row) => row.id === memberId);
  if (!member) return null;
  const fields = cardValues(input.story, input.values, member.id, true), signature = lookSignature(fields);
  const base = { member: member.id, name: member.name ?? member.id, tags: [] as string[], substituted: false };
  const found = bound(input.catalog, input.story.illustrations?.packs?.identities?.[member.id], "identity");
  if ("fallback" in found) return { ...base, source: "none", fallback: found.fallback, ...(found.newer ? { newer: found.newer } : {}), intended: { look: null, fields, signature } };
  const pack = found.pack;
  const intended = Object.entries(pack.looks).find(([, look]) => lookSignature(look.fields) === signature)?.[0] ?? null;
  const exact = intended ? lookImages(pack, intended, input.verified) : null;
  const shown = exact ?? (intended === pack.defaultLook ? null : lookImages(pack, pack.defaultLook, input.verified));
  const newer = newerRevision(input.catalog, packRef(pack));
  const head = { ...base, pack: packRef(pack), qa: pack.qa.status, ...(newer ? { newer: packRef(newer) } : {}), intended: { look: intended, fields, signature } };
  if (!shown) return { ...head, source: "none", fallback: "asset-mismatch" };
  return { ...head, source: "pack", tags: identityTags(pack, input.family), displayed: shown, substituted: !exact,
    ...(exact ? {} : { fallback: intended ? "asset-mismatch" as const : "look-missing" as const }) };
}

const backgroundName = (name: string): string | null => name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || null;

function place(input: SceneInput): ScenePlace {
  const places = input.story.illustrations?.packs?.places ?? {};
  for (const id of [...input.path].reverse()) {
    const ref = places[id], background = input.story.checkpointById[id]?.effects?.background?.name;
    if (!ref && !background) continue;
    const named = background ? backgroundName(background) : null;
    const found = bound(input.catalog, ref, "place");
    if ("fallback" in found) return { checkpoint: id, source: "none", fallback: found.fallback, ...(found.newer ? { newer: found.newer } : {}), name: named, tags: [] };
    return placeFrom(input, id, found.pack, named);
  }
  return { checkpoint: null, source: "none", fallback: "unbound", name: null, tags: [] };
}

function placeFrom(input: SceneInput, checkpoint: string, pack: PlacePack, named: string | null): ScenePlace {
  const variant = Object.entries(pack.variants ?? {}).find(([, entry]) => Object.entries(entry.when).every(([key, value]) => String(input.values[key] ?? "") === value));
  const chosen = variant ? packAsset(pack, variant[1].plate) : undefined;
  const canonical = packAsset(pack, pack.plate);
  const plate = chosen && input.verified(chosen) ? { asset: chosen, variant: variant?.[0] } : canonical && input.verified(canonical) ? { asset: canonical } : null;
  const newer = newerRevision(input.catalog, packRef(pack));
  const head = { checkpoint, pack: packRef(pack), qa: pack.qa.status, ...(newer ? { newer: packRef(newer) } : {}) };
  if (!plate) return { ...head, source: "none", fallback: "asset-mismatch", name: named, tags: [] };
  return { ...head, source: "pack", ...(plate.variant ? { variant: plate.variant } : {}), ...(variant && !plate.variant ? { fallback: "asset-mismatch" as const } : {}),
    plate: file(plate.asset), name: pack.name, description: pack.description, tags: pack.tags };
}

function style(input: SceneInput): SceneStyle {
  const found = bound(input.catalog, input.story.illustrations?.packs?.style, "style");
  if ("fallback" in found) return { source: "none", fallback: found.fallback };
  const pack: StylePack = found.pack, recipe = input.family ? pack.recipes[input.family] : undefined;
  return { source: "pack", pack: packRef(pack), target: pack.target, ...(recipe ? { recipe } : {}) };
}

export function resolveVisualScene(input: SceneInput): VisualScene {
  const subjects = [...new Set(input.members)].flatMap((id) => subject(input, id) ?? []);
  const scenePlace = place(input), sceneStyle = style(input);
  const refs = [...subjects.map((row) => row.pack), scenePlace.pack, sceneStyle.pack].flatMap((ref) => (ref ? [packKey(ref)] : []));
  const files = [...subjects.flatMap((row) => row.source === "pack" && row.displayed ? [row.displayed.base, ...(row.displayed.bust ? [row.displayed.bust] : [])] : []),
    ...(scenePlace.plate ? [scenePlace.plate] : [])];
  const dependencies = [...new Map(files.map((entry) => [`${entry.path}\n${entry.sha256}`, entry])).values()].sort((a, b) => a.path.localeCompare(b.path));
  const packs = [...new Set(refs)].sort();
  const key = stableStringify({ packs, dependencies, looks: subjects.map((row) => [row.member, row.source, row.displayed?.look ?? null, row.intended.signature]),
    place: [scenePlace.checkpoint, scenePlace.source, scenePlace.variant ?? null] });
  return { subjects, place: scenePlace, style: sceneStyle, packs, dependencies, key };
}

export const bindsPacks = (story: Pick<NormalizedStory, "illustrations"> | null | undefined): boolean => {
  const packs = story?.illustrations?.packs;
  return Boolean(packs && (packs.style || Object.keys(packs.identities ?? {}).length || Object.keys(packs.places ?? {}).length));
};

export interface DirectorView {
  subjects: Array<{ name: string; tags: string[]; look: Record<string, string> }>;
  place: { name: string; description?: string; tags: string[] } | null;
  style: string | null;
}

export const directorView = (scene: VisualScene): DirectorView => ({
  subjects: scene.subjects.filter((row) => row.source === "pack").map((row) => ({ name: row.name, tags: row.tags, look: row.intended.fields })),
  place: scene.place.source === "pack" && scene.place.name ? { name: scene.place.name, ...(scene.place.description ? { description: scene.place.description } : {}), tags: scene.place.tags }
    : scene.place.name ? { name: scene.place.name, tags: [] } : null,
  style: scene.style.target ?? null,
});

export interface VisualRecord {
  scene: string; packs: string[];
  subjects: Array<{ member: string; source: SceneSubject["source"]; fallback?: VisualFallback; look: string | null; substituted: boolean; qa?: QaStatus }>;
  place: { source: ScenePlace["source"]; fallback?: VisualFallback; variant?: string; qa?: QaStatus };
  style: { source: SceneStyle["source"]; fallback?: VisualFallback };
}

export const visualRecord = (scene: VisualScene): VisualRecord => ({
  scene: scene.key, packs: scene.packs,
  subjects: scene.subjects.map((row) => ({ member: row.member, source: row.source, ...(row.fallback ? { fallback: row.fallback } : {}),
    look: row.displayed?.look ?? null, substituted: row.substituted, ...(row.qa ? { qa: row.qa } : {}) })),
  place: { source: scene.place.source, ...(scene.place.fallback ? { fallback: scene.place.fallback } : {}), ...(scene.place.variant ? { variant: scene.place.variant } : {}),
    ...(scene.place.qa ? { qa: scene.place.qa } : {}) },
  style: { source: scene.style.source, ...(scene.style.fallback ? { fallback: scene.style.fallback } : {}) },
});

import { isRecord } from "@utils/guards";
import { stableStringify } from "@runtime/hash";
import { VISUAL_PACK_DIGEST, VISUAL_PACK_ID } from "@engine/validate/illustrations";
import type { VisualPackRef } from "@engine/schema";
import { lookSignature } from "../visualManifest";

export const VISUAL_PACK_FORMAT = 1;
export const PACK_KINDS = ["identity", "place", "style"] as const;
export type PackKind = (typeof PACK_KINDS)[number];
export const PACK_MEDIA = ["image/png", "image/jpeg", "image/webp"] as const;
export type PackMedia = (typeof PACK_MEDIA)[number];
export type QaStatus = "accepted" | "review" | "unknown";

export interface PackAsset {
  path: string; sha256: string; bytes: number; media: PackMedia; role: string;
  width?: number; height?: number; deps?: string[]; recipe?: string;
}
export interface PackQa { status: QaStatus; rubric?: string; findings?: string[] }
export interface PackProvenance { source: string; recipe?: string; notes?: string }
interface Envelope {
  formatVersion: typeof VISUAL_PACK_FORMAT; id: string; revision: number; digest: string; styleRef?: VisualPackRef;
  assets: PackAsset[]; coverage?: Record<string, number>; qa: PackQa; provenance: PackProvenance;
}
export interface IdentityLook { fields: Record<string, string>; base: string; bust?: string; face?: string; expressions?: Record<string, string> }
export interface IdentityPack extends Envelope {
  kind: "identity"; subjectId: string; traits: string[]; tagsByFamily: Record<string, string[]>; defaultLook: string; looks: Record<string, IdentityLook>;
}
export interface PlaceVariant { when: Record<string, string>; plate: string }
export interface PlacePack extends Envelope {
  kind: "place"; placeId: string; name: string; description: string; tags: string[]; plate: string; variants?: Record<string, PlaceVariant>;
}
export interface StyleRecipe { positive: string[]; negative: string[]; checkpoint?: string; sampler?: string; steps?: number; cfg?: number }
export interface StylePack extends Envelope { kind: "style"; target: string; recipes: Record<string, StyleRecipe> }
export type VisualPack = IdentityPack | PlacePack | StylePack;
export type PackRead = { ok: true; pack: VisualPack } | { ok: false; problems: string[] };

export const packKey = (ref: VisualPackRef): string => `${ref.id}@${ref.digest}`;
export const packRef = (pack: Pick<VisualPack, "id" | "digest">): VisualPackRef => ({ id: pack.id, digest: pack.digest });
export const packDigestText = (pack: VisualPack): string => {
  const { digest: _digest, ...rest } = pack;
  return stableStringify(rest);
};
export const packAsset = (pack: VisualPack, role: string): PackAsset | undefined => pack.assets.find((asset) => asset.role === role);

const ROLE = /^[a-z0-9][a-z0-9_.:-]{0,127}$/;
const LOOK_ID = /^[a-z0-9_]{1,64}$/;
const FAMILY = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export const servedPackPath = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 2048 || !/^\/(characters|backgrounds)\/./.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    return !/[\\?#]/.test(decoded) && [...decoded].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127) && !decoded.split("/").includes("..");
  } catch { return false; }
};

class Reader {
  readonly problems: string[] = [];
  fail(path: string, message: string): undefined { this.problems.push(`${path}: ${message}`); return undefined; }
  keys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) this.fail(`${path}.${key}`, "unknown key");
  }
  text(value: unknown, path: string, max: number, optional = false): string | undefined {
    if (value === undefined && optional) return undefined;
    return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value : this.fail(path, `needs text of at most ${max} characters`);
  }
  int(value: unknown, path: string, min: number, max: number, optional = false): number | undefined {
    if (value === undefined && optional) return undefined;
    return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : this.fail(path, `needs a whole number from ${min} to ${max}`);
  }
  pattern(value: unknown, path: string, pattern: RegExp, what: string): string | undefined {
    return typeof value === "string" && pattern.test(value) ? value : this.fail(path, `needs ${what}`);
  }
  list(value: unknown, path: string, max: number, maxChars: number): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > max) return this.fail(path, `needs a list of at most ${max} texts`) ?? [];
    return value.flatMap((entry, index) => { const text = this.text(entry, `${path}.${index}`, maxChars); return text === undefined ? [] : [text]; });
  }
  map<T>(value: unknown, path: string, max: number, key: RegExp, read: (entry: unknown, at: string) => T | undefined, optional = false): Record<string, T> | undefined {
    if (value === undefined && optional) return undefined;
    if (!isRecord(value) || Object.keys(value).length > max) return this.fail(path, `needs an object of at most ${max} entries`);
    return Object.fromEntries(Object.entries(value).flatMap(([id, entry]) => {
      if (!key.test(id)) return this.fail(`${path}.${id}`, "has an invalid key") ?? [];
      const read_ = read(entry, `${path}.${id}`);
      return read_ === undefined ? [] : [[id, read_]];
    }));
  }
  fields(value: unknown, path: string): Record<string, string> | undefined {
    return this.map(value, path, 16, /^[A-Za-z0-9_ -]{1,64}$/, (entry, at) => this.text(entry, at, 400));
  }
  ref(value: unknown, path: string): VisualPackRef | undefined {
    if (!isRecord(value)) return this.fail(path, "needs {id, digest}");
    this.keys(value, ["id", "digest"], path);
    const id = this.pattern(value.id, `${path}.id`, VISUAL_PACK_ID, "a pack id"), digest = this.pattern(value.digest, `${path}.digest`, VISUAL_PACK_DIGEST, "a sha256");
    return id && digest ? { id, digest } : undefined;
  }
  asset(value: unknown, path: string): PackAsset | undefined {
    if (!isRecord(value)) return this.fail(path, "needs an asset object");
    this.keys(value, ["path", "sha256", "bytes", "media", "role", "width", "height", "deps", "recipe"], path);
    const served = servedPackPath(value.path) ? value.path : this.fail(`${path}.path`, "needs a file served under /characters/ or /backgrounds/");
    const sha256 = this.pattern(value.sha256, `${path}.sha256`, VISUAL_PACK_DIGEST, "a sha256");
    const bytes = this.int(value.bytes, `${path}.bytes`, 1, 64_000_000);
    const media = (PACK_MEDIA as readonly unknown[]).includes(value.media) ? value.media as PackMedia : this.fail(`${path}.media`, `needs one of ${PACK_MEDIA.join(", ")}`);
    const role = this.pattern(value.role, `${path}.role`, ROLE, "a role");
    const width = this.int(value.width, `${path}.width`, 1, 16384, true), height = this.int(value.height, `${path}.height`, 1, 16384, true);
    const deps = value.deps === undefined ? undefined : Array.isArray(value.deps) && value.deps.length <= 16 && value.deps.every((dep) => typeof dep === "string" && VISUAL_PACK_DIGEST.test(dep))
      ? value.deps as string[] : this.fail(`${path}.deps`, "needs at most 16 sha256 values");
    const recipe = this.text(value.recipe, `${path}.recipe`, 128, true);
    if (!served || !sha256 || bytes === undefined || !media || !role) return undefined;
    return { path: served, sha256, bytes, media, role, ...(width ? { width } : {}), ...(height ? { height } : {}), ...(deps ? { deps } : {}), ...(recipe ? { recipe } : {}) };
  }
}

const ENVELOPE = ["formatVersion", "id", "kind", "revision", "digest", "styleRef", "assets", "coverage", "qa", "provenance"];
const KIND_KEYS: Record<PackKind, string[]> = {
  identity: ["subjectId", "traits", "tagsByFamily", "defaultLook", "looks"],
  place: ["placeId", "name", "description", "tags", "plate", "variants"],
  style: ["target", "recipes"],
};

function readEnvelope(r: Reader, value: Record<string, unknown>): Envelope | undefined {
  if (value.formatVersion !== VISUAL_PACK_FORMAT) r.fail("formatVersion", `needs ${VISUAL_PACK_FORMAT}`);
  const id = r.pattern(value.id, "id", VISUAL_PACK_ID, "a pack id"), digest = r.pattern(value.digest, "digest", VISUAL_PACK_DIGEST, "a sha256");
  const revision = r.int(value.revision, "revision", 1, 1_000_000);
  const styleRef = value.styleRef === undefined ? undefined : r.ref(value.styleRef, "styleRef");
  const assets = Array.isArray(value.assets) && value.assets.length <= 512
    ? value.assets.flatMap((asset, index) => { const read = r.asset(asset, `assets.${index}`); return read ? [read] : []; })
    : r.fail("assets", "needs a list of at most 512 assets") ?? [];
  const roles = new Set<string>();
  for (const asset of assets) { if (roles.has(asset.role)) r.fail(`assets.${asset.role}`, "role is listed twice"); roles.add(asset.role); }
  const coverage = r.map(value.coverage, "coverage", 32, FAMILY, (entry, at) => r.int(entry, at, 0, 1_000_000), true);
  const qa = isRecord(value.qa) ? value.qa : r.fail("qa", "needs {status}");
  if (qa) r.keys(qa, ["status", "rubric", "findings"], "qa");
  const status = qa && ["accepted", "review", "unknown"].includes(qa.status as string) ? qa.status as QaStatus : r.fail("qa.status", "needs accepted, review or unknown");
  const provenance = isRecord(value.provenance) ? value.provenance : r.fail("provenance", "needs {source}");
  if (provenance) r.keys(provenance, ["source", "recipe", "notes"], "provenance");
  const source = provenance ? r.text(provenance.source, "provenance.source", 200) : undefined;
  if (!id || !digest || revision === undefined || !status || !source || !qa || !provenance) return undefined;
  const rubric = r.text(qa.rubric, "qa.rubric", 120, true), findings = qa.findings === undefined ? undefined : r.list(qa.findings, "qa.findings", 32, 300);
  const recipe = r.text(provenance.recipe, "provenance.recipe", 200, true), notes = r.text(provenance.notes, "provenance.notes", 600, true);
  return { formatVersion: VISUAL_PACK_FORMAT, id, revision, digest, ...(styleRef ? { styleRef } : {}), assets, ...(coverage ? { coverage } : {}),
    qa: { status, ...(rubric ? { rubric } : {}), ...(findings ? { findings } : {}) }, provenance: { source, ...(recipe ? { recipe } : {}), ...(notes ? { notes } : {}) } };
}

function imageRole(r: Reader, envelope: Envelope, value: unknown, path: string): string | undefined {
  if (typeof value !== "string") return r.fail(path, "needs an asset role");
  return envelope.assets.some((asset) => asset.role === value) ? value : r.fail(path, `names no asset '${value}'`);
}

function readIdentity(r: Reader, value: Record<string, unknown>, envelope: Envelope): IdentityPack | undefined {
  const subjectId = r.pattern(value.subjectId, "subjectId", VISUAL_PACK_ID, "a subject id");
  const traits = r.list(value.traits, "traits", 32, 120);
  const tagsByFamily = r.map(value.tagsByFamily, "tagsByFamily", 8, FAMILY, (entry, at) => r.list(entry, at, 64, 80)) ?? {};
  const looks = r.map(value.looks, "looks", 64, LOOK_ID, (entry, at) => {
    if (!isRecord(entry)) return r.fail(at, "needs a look object");
    r.keys(entry, ["fields", "base", "bust", "face", "expressions"], at);
    const fields = r.fields(entry.fields, `${at}.fields`), base = imageRole(r, envelope, entry.base, `${at}.base`);
    const bust = entry.bust === undefined ? undefined : imageRole(r, envelope, entry.bust, `${at}.bust`);
    const face = entry.face === undefined ? undefined : imageRole(r, envelope, entry.face, `${at}.face`);
    const expressions = r.map(entry.expressions, `${at}.expressions`, 64, /^[a-z0-9_]{1,40}$/, (role, where) => imageRole(r, envelope, role, where), true);
    if (!fields || !base) return undefined;
    return { fields, base, ...(bust ? { bust } : {}), ...(face ? { face } : {}), ...(expressions ? { expressions } : {}) };
  }) ?? {};
  const defaultLook = typeof value.defaultLook === "string" && looks[value.defaultLook] ? value.defaultLook : r.fail("defaultLook", "names no look");
  if (defaultLook && Object.keys(looks[defaultLook].fields).length) r.fail("defaultLook", "the default look has no changed fields");
  const signatures = new Set<string>();
  for (const [id, look] of Object.entries(looks)) {
    const signature = lookSignature(look.fields);
    if (signatures.has(signature)) r.fail(`looks.${id}`, "repeats another look's fields");
    signatures.add(signature);
  }
  if (!subjectId || !defaultLook) return undefined;
  return { ...envelope, kind: "identity", subjectId, traits, tagsByFamily, defaultLook, looks };
}

function readPlace(r: Reader, value: Record<string, unknown>, envelope: Envelope): PlacePack | undefined {
  const placeId = r.pattern(value.placeId, "placeId", VISUAL_PACK_ID, "a place id");
  const name = r.text(value.name, "name", 120), description = r.text(value.description, "description", 600);
  const tags = r.list(value.tags, "tags", 48, 80), plate = imageRole(r, envelope, value.plate, "plate");
  const variants = r.map(value.variants, "variants", 16, LOOK_ID, (entry, at) => {
    if (!isRecord(entry)) return r.fail(at, "needs {when, plate}");
    r.keys(entry, ["when", "plate"], at);
    const when = r.fields(entry.when, `${at}.when`), variantPlate = imageRole(r, envelope, entry.plate, `${at}.plate`);
    if (when && !Object.keys(when).length) r.fail(`${at}.when`, "names no state");
    return when && Object.keys(when).length && variantPlate ? { when, plate: variantPlate } : undefined;
  }, true);
  if (!placeId || !name || !description || !plate) return undefined;
  return { ...envelope, kind: "place", placeId, name, description, tags, plate, ...(variants ? { variants } : {}) };
}

function readStyle(r: Reader, value: Record<string, unknown>, envelope: Envelope): StylePack | undefined {
  const target = r.text(value.target, "target", 600);
  const recipes = r.map(value.recipes, "recipes", 8, FAMILY, (entry, at) => {
    if (!isRecord(entry)) return r.fail(at, "needs a recipe object");
    r.keys(entry, ["positive", "negative", "checkpoint", "sampler", "steps", "cfg"], at);
    const checkpoint = r.text(entry.checkpoint, `${at}.checkpoint`, 200, true), sampler = r.text(entry.sampler, `${at}.sampler`, 64, true);
    const steps = r.int(entry.steps, `${at}.steps`, 1, 200, true);
    const cfg = entry.cfg === undefined ? undefined : typeof entry.cfg === "number" && entry.cfg > 0 && entry.cfg <= 30 ? entry.cfg : r.fail(`${at}.cfg`, "needs a number from 0 to 30");
    return { positive: r.list(entry.positive, `${at}.positive`, 64, 80), negative: r.list(entry.negative, `${at}.negative`, 64, 80),
      ...(checkpoint ? { checkpoint } : {}), ...(sampler ? { sampler } : {}), ...(steps ? { steps } : {}), ...(cfg ? { cfg } : {}) };
  }) ?? {};
  if (!target) return undefined;
  return { ...envelope, kind: "style", target, recipes };
}

export function readVisualPack(value: unknown): PackRead {
  const r = new Reader();
  if (!isRecord(value)) return { ok: false, problems: ["pack: needs an object"] };
  const kind = (PACK_KINDS as readonly unknown[]).includes(value.kind) ? value.kind as PackKind : undefined;
  if (!kind) return { ok: false, problems: [`kind: needs one of ${PACK_KINDS.join(", ")}`] };
  r.keys(value, [...ENVELOPE, ...KIND_KEYS[kind]], "pack");
  const envelope = readEnvelope(r, value);
  const pack = envelope && (kind === "identity" ? readIdentity(r, value, envelope) : kind === "place" ? readPlace(r, value, envelope) : readStyle(r, value, envelope));
  return pack && !r.problems.length ? { ok: true, pack } : { ok: false, problems: r.problems.length ? r.problems : ["pack: incomplete"] };
}

import type { CardBinding, CardLayer, PoseEntry } from "@engine/schema";
import { stableStringify } from "@runtime/hash";
import { contentHash } from "../builder/recipes";
import type { EditModels } from "../builder/recipes";
import type { AlphaRecipe } from "@services/stHost/media";
import type { Retarget } from "./skeleton";

export interface LookLayers { base: Record<string, string>; face: Record<string, string>; decal: Record<string, string>; rebase: boolean; regions: Record<string,
  NonNullable<CardBinding["fields"][string]["region"]>> }

export function lookLayers(card: CardBinding | undefined, values: Record<string, string>): LookLayers {
  const out: LookLayers = { base: {}, face: {}, decal: {}, rebase: false, regions: {} };
  for (const [field, value] of Object.entries(values)) {
    const binding = card?.fields[field];
    if (!binding?.visual || !value.trim()) continue;
    const layer: CardLayer = binding.layer ?? "base";
    out[layer][field] = value;
    if (layer === "base" && binding.rebase) out.rebase = true;
    if (layer === "decal" && binding.region) out.regions[field] = binding.region;
  }
  return out;
}

export interface PoseCacheInput { member: string; story: string; fields: Record<string, string>; pose: Pick<PoseEntry, "id" | "version" | "keypoints" | "text">;
  retarget: Retarget; recipe: { id: string; version: number }; models: EditModels; base: string; steps: number; resolution: number;
  cutout?: AlphaRecipe; secondReference?: boolean }
export const poseKeyInput = (input: PoseCacheInput): string => stableStringify({ contract: 1, ...input });
export const poseCacheKey = (input: PoseCacheInput): Promise<string> => contentHash(new TextEncoder().encode(poseKeyInput(input)));
export const poseSet = (key: string): string => `lp_${key.slice(0, 8)}`;

export interface CachedBody { set: string; look: string; pose: string; tags: readonly string[]; stamp?: string }
export function fallbackBodies(wanted: CachedBody, cached: readonly CachedBody[], current: string): string[] {
  return [...new Set([wanted.set, ...cached.filter((body) => body.look === wanted.look && body.tags.some((tag) => wanted.tags.includes(tag))).map((body) => body.set),
    ...cached.filter((body) => body.look === wanted.look && body.pose === "stand_relaxed").map((body) => body.set),
    ...cached.filter((body) => body.pose === wanted.pose).map((body) => body.set), "default", current])];
}

export function layerChanges(before: LookLayers, after: LookLayers, bodies: readonly CachedBody[], requestedPose?: string): Array<{ layer: CardLayer; set?: string;
  pose?: string; field?: string; source?: "card" | "base" }> {
  if (stableStringify(before.base) !== stableStringify(after.base) || before.rebase !== after.rebase) return requestedPose ? [{ layer: "base", pose: requestedPose,
    source: after.rebase ? "card" : "base" }] : [];
  const decal = [...new Set([...Object.keys(before.decal), ...Object.keys(after.decal)])].filter((field) => before.decal[field] !== after.decal[field]);
  if (decal.length) return bodies.flatMap((body) => decal.map((field) => ({ layer: "decal" as const, set: body.set, field })));
  return stableStringify(before.face) !== stableStringify(after.face) ? bodies.map((body) => ({ layer: "face", set: body.set })) : [];
}

export function renderAllowed(request: { pose: string; fields: Record<string, string> }, history: readonly Record<string, string>[], poses: readonly string[]): boolean {
  return poses.includes(request.pose) && history.some((values) => Object.entries(request.fields).every(([field, value]) => values[field] === value));
}

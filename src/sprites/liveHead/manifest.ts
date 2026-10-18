import { isRecord } from "@utils/guards";
import { liveHeadKey, localHeadAsset, type LiveHeadRef } from "../liveHeadRefs";
import { parseRig } from "./validate";
import type { Rig } from "./types";

export type Rect = [number, number, number, number];
export const HEAD_MANIFEST_VERSION = 1;
export const HEAD_LAYERS = ["base", ...[0, 1].flatMap((eye) => ["ball", "low", "crease", "lash"].map((part) => `eye${eye}_${part}`))];
export const HAND_LAYER = "hand";
const LAYER_ORDER = [...HEAD_LAYERS, HAND_LAYER];
export interface HeadLayer { name: string; rect: Rect; image: string }
export interface HeadManifest {
  version: typeof HEAD_MANIFEST_VERSION;
  member: string;
  look: string;
  artHash: string;
  source: string;
  rig: Rig;
  layers: HeadLayer[];
}

export function loadHeadManifest(value: unknown, expected?: LiveHeadRef): HeadManifest {
  if (!isRecord(value) || value.version !== HEAD_MANIFEST_VERSION || typeof value.member !== "string" || !value.member
    || typeof value.look !== "string" || !value.look || typeof value.artHash !== "string" || !/^[a-f0-9]{64}$/.test(value.artHash)
    || !localHeadAsset(value.source)) throw new Error("Invalid live head identity.");
  if (expected && (liveHeadKey({ member: value.member, look: value.look, artHash: value.artHash }) !== liveHeadKey(expected) || value.source !== expected.source))
    throw new Error("This rig belongs to another member, look or artwork.");
  const rig = parseRig(value.rig);
  if (rig.image.width > 2048 || rig.image.height > 2048) throw new Error("Live head images must fit within 2048 pixels.");
  if (!Array.isArray(value.layers) || value.layers.length < HEAD_LAYERS.length || value.layers.length > LAYER_ORDER.length) throw new Error("Expected base and eight eye layers.");
  const layers = value.layers.map((layer: unknown): HeadLayer => {
    if (!isRecord(layer) || typeof layer.name !== "string" || !LAYER_ORDER.includes(layer.name) || !localHeadAsset(layer.image)
      || !Array.isArray(layer.rect) || layer.rect.length !== 4 || !layer.rect.every((n: unknown) => typeof n === "number" && Number.isInteger(n)))
      throw new Error("Invalid live head layer.");
    const rect = layer.rect as Rect;
    if (rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0 || rect[0] + rect[2] > rig.image.width || rect[1] + rect[3] > rig.image.height)
      throw new Error("Layer rectangle must fit inside the artwork.");
    const cell = layer.name === "base" ? Math.min(rig.mesh.baseCell, rig.mesh.fine.cell) : layer.name === HAND_LAYER ? rig.mesh.handCell : Math.min(rig.mesh.eyeCell, rig.mesh.eyeBallCell);
    if ((Math.ceil(rect[2] / cell) + 1) * (Math.ceil(rect[3] / cell) + 1) > 40_000) throw new Error("Rig mesh exceeds the vertex limit.");
    return { name: layer.name, rect: [...rect], image: layer.image };
  });
  if (!rig.hand && layers.some((layer) => layer.name === HAND_LAYER)) throw new Error("A hand layer needs the rig's hand bones.");
  if (new Set(layers.map((layer) => layer.name)).size !== layers.length || !HEAD_LAYERS.every((name) => layers.some((layer) => layer.name === name)))
    throw new Error("Duplicate live head layer.");
  layers.sort((a, b) => LAYER_ORDER.indexOf(a.name) - LAYER_ORDER.indexOf(b.name));
  return { version: HEAD_MANIFEST_VERSION, member: value.member, look: value.look, artHash: value.artHash, source: value.source, rig, layers };
}

export function manifestRef(manifest: HeadManifest): LiveHeadRef {
  const { member, look, artHash, source } = manifest;
  return { member, look, artHash, source, manifest: `data:application/json,${encodeURIComponent(JSON.stringify(manifest))}` };
}

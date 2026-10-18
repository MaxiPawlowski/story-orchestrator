import { isRecord } from "@utils/guards";
import { localHeadAsset } from "../../liveHeadRefs";
import type { BodyLayer, BodyManifest, BodyRig } from "./types";

export const BODY_MANIFEST_VERSION = 1;
export const BODY_LAYERS = ["base", "arm0", "arm1"];
const MAX_SIDE = 2048, MAX_VERTICES = 60_000;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const point = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]);
const band = (v: unknown): boolean => point(v) && (v as number[])[0] < (v as number[])[1];
const ellipse = (v: unknown): boolean => isRecord(v) && finite(v.cx) && finite(v.cy) && finite(v.rx) && finite(v.ry) && v.rx > 0 && v.ry > 0;
const positive = (v: unknown): boolean => finite(v) && v > 0;
const whole = (v: unknown): boolean => positive(v) && Number.isInteger(v);

export function validateBodyRig(value: unknown): string[] {
  const errors: string[] = [], need = (ok: boolean, message: string) => { if (!ok) errors.push(message); };
  if (!isRecord(value)) return ["body: expected an object"];
  need(value.version === 1, "body.version: only version 1 is supported");
  need(value.kind === "body", "body.kind: expected \"body\"");
  need(value.pose === "standing" || value.pose === "sitting" || value.pose === "other", "body.pose: expected standing, sitting or other");
  const image = value.image;
  need(isRecord(image) && whole(image.width) && whole(image.height), "body.image: expected integer width and height");
  const head = value.head;
  need(isRecord(head) && ellipse(head) && finite(head.pivotX) && finite(head.pivotY) && finite(head.maxRoll) && band(head.band) && band(head.side),
    "body.head: expected an oval, neck pivot, maxRoll, band and side band");
  const torso = value.torso;
  need(isRecord(torso) && finite(torso.pivotX) && finite(torso.pivotY) && finite(torso.maxRoll) && finite(torso.sway) && finite(torso.breath)
    && band(torso.waistBand) && band(torso.breathBand) && ellipse(torso.chest), "body.torso: expected pivot, maxRoll, sway, breath, waist and breath bands and a chest oval");
  const mesh = value.mesh;
  need(isRecord(mesh) && whole(mesh.baseCell) && whole(mesh.armCell), "body.mesh: expected integer cells");
  if (value.arms !== undefined) {
    if (!Array.isArray(value.arms) || value.arms.length > 2) errors.push("body.arms: expected up to two arms");
    else value.arms.forEach((arm: unknown, i: number) => {
      need(isRecord(arm) && (arm.side === "left" || arm.side === "right") && (arm.state === "free" || arm.state === "resting" || arm.state === "holding")
        && point(arm.shoulder) && point(arm.elbow) && point(arm.wrist) && Array.isArray(arm.outline) && arm.outline.length >= 3 && arm.outline.every(point)
        && finite(arm.swing) && finite(arm.bend), `body.arms[${i}]: expected side, state, shoulder, elbow, wrist, outline, swing and bend`);
    });
  }
  if (value.strands !== undefined) {
    if (!Array.isArray(value.strands)) errors.push("body.strands: expected an array");
    else value.strands.forEach((strand: unknown, i: number) => {
      need(isRecord(strand) && typeof strand.name === "string" && Array.isArray(strand.nodes) && strand.nodes.length >= 2 && strand.nodes.every(point)
        && positive(strand.sigma) && positive(strand.k) && positive(strand.max), `body.strands[${i}]: expected name, nodes, sigma, k and max`);
    });
  }
  if (value.eyes !== undefined) need(Array.isArray(value.eyes) && value.eyes.length <= 2 && value.eyes.every(ellipse), "body.eyes: expected up to two ovals");
  if (errors.length) return errors;
  const rig = value as unknown as BodyRig;
  need(rig.head.cy < rig.head.pivotY && rig.head.pivotY < rig.torso.pivotY, "body: expected head, neck and hips from top to bottom");
  need(rig.torso.waistBand[1] <= rig.image.height && rig.torso.waistBand[0] >= 0, "body.torso.waistBand: must lie inside the image");
  for (const [i, arm] of (rig.arms ?? []).entries())
    need(Math.hypot(arm.elbow[0] - arm.shoulder[0], arm.elbow[1] - arm.shoulder[1]) >= 2 && Math.hypot(arm.wrist[0] - arm.elbow[0], arm.wrist[1] - arm.elbow[1]) >= 2,
      `body.arms[${i}]: shoulder, elbow and wrist must differ`);
  return errors;
}

export function loadBodyManifest(value: unknown): BodyManifest {
  if (!isRecord(value) || value.version !== BODY_MANIFEST_VERSION || value.kind !== "body" || typeof value.member !== "string" || !value.member
    || typeof value.look !== "string" || !value.look || typeof value.pose !== "string" || !value.pose
    || typeof value.artHash !== "string" || !/^[a-f0-9]{64}$/.test(value.artHash) || !localHeadAsset(value.source)) throw new Error("Invalid body rig identity.");
  const errors = validateBodyRig(value.rig);
  if (errors.length) throw new Error(`Invalid body rig:\n${errors.join("\n")}`);
  const rig = JSON.parse(JSON.stringify(value.rig)) as BodyRig;
  if (rig.image.width > MAX_SIDE || rig.image.height > MAX_SIDE) throw new Error("Body images must fit within 2048 pixels.");
  if (!Array.isArray(value.layers) || !value.layers.length || value.layers.length > BODY_LAYERS.length) throw new Error("Expected a base layer and up to two arm layers.");
  const layers = value.layers.map((layer: unknown): BodyLayer => {
    if (!isRecord(layer) || typeof layer.name !== "string" || !BODY_LAYERS.includes(layer.name) || !localHeadAsset(layer.image)
      || !Array.isArray(layer.rect) || layer.rect.length !== 4 || !layer.rect.every((n: unknown) => typeof n === "number" && Number.isInteger(n)))
      throw new Error("Invalid body layer.");
    const rect = layer.rect as BodyLayer["rect"];
    if (rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0 || rect[0] + rect[2] > rig.image.width || rect[1] + rect[3] > rig.image.height)
      throw new Error("Body layer rectangle must fit inside the artwork.");
    const cell = layer.name === "base" ? rig.mesh.baseCell : rig.mesh.armCell;
    if ((Math.ceil(rect[2] / cell) + 1) * (Math.ceil(rect[3] / cell) + 1) > MAX_VERTICES) throw new Error("Body mesh exceeds the vertex limit.");
    if (layer.name !== "base" && rig.arms?.[Number(layer.name.slice(3))]?.state !== "free") throw new Error("An arm layer needs a free arm.");
    return { name: layer.name, rect: [...rect], image: layer.image };
  });
  if (new Set(layers.map((layer) => layer.name)).size !== layers.length || !layers.some((layer) => layer.name === "base")) throw new Error("Duplicate or missing body layer.");
  layers.sort((a, b) => BODY_LAYERS.indexOf(a.name) - BODY_LAYERS.indexOf(b.name));
  return { version: BODY_MANIFEST_VERSION, kind: "body", member: value.member, look: value.look, pose: value.pose, artHash: value.artHash, source: value.source, rig, layers };
}

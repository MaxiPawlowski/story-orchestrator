import type { PixelImage } from "../../builder/pixels";
import type { Eye, Point, Rig } from "../types";
import type { Rect } from "../manifest";

export interface CutLayer { name: string; rect: Rect; image: PixelImage }
const PARTS = ["ball", "low", "crease", "lash"] as const;

const luminance = (r: number, g: number, b: number): number => r * 0.3 + g * 0.59 + b * 0.11;
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((p / 100) * (sorted.length - 1))];
};
const median = (values: number[]): number => percentile(values, 50);
export const insidePolygon = (polygon: Point[], x: number, y: number): boolean => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const sampled = (values: number[], u: number): number => {
  const f = Math.min(1, Math.max(0, u)) * (values.length - 1), i = Math.min(Math.floor(f), values.length - 2);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
};

export function roiRect(eye: Eye, size: { width: number; height: number }): Rect {
  const xs = eye.roi.map((p) => p[0]), ys = eye.roi.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(size.width, Math.ceil(Math.max(...xs))), y1 = Math.min(size.height, Math.ceil(Math.max(...ys)));
  if (x1 <= x0 || y1 <= y0) throw new Error("An eye region has no area inside the bust.");
  return [x0, y0, x1 - x0, y1 - y0];
}

function skinColour(image: PixelImage, rect: Rect): { colour: [number, number, number]; tolerance: number } {
  const [rx, ry, rw, rh] = rect, ring = Math.max(4, Math.round(Math.min(rw, rh) / 2));
  const pixels: Array<[number, number, number]> = [];
  for (let y = Math.max(0, ry - ring); y < Math.min(image.height, ry + rh + ring); y++) {
    for (let x = Math.max(0, rx - ring); x < Math.min(image.width, rx + rw + ring); x++) {
      if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) continue;
      const i = (y * image.width + x) * 4;
      if (image.data[i + 3] > 200) pixels.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
    }
  }
  if (!pixels.length) throw new Error("No opaque skin surrounds an eye; the bust cannot be rigged.");
  const cut = percentile(pixels.map((p) => luminance(...p)), 55);
  const light = pixels.filter((p) => luminance(...p) >= cut);
  const colour: [number, number, number] = [median(light.map((p) => p[0])), median(light.map((p) => p[1])), median(light.map((p) => p[2]))];
  const spread = median(light.map((p) => Math.max(...p.map((v, k) => Math.abs(v - colour[k])))));
  return { colour, tolerance: Math.max(22, Math.min(60, spread * 3)) };
}

function eyeMasks(image: PixelImage, eye: Eye, rect: Rect) {
  const [rx, ry, rw, rh] = rect, count = rw * rh;
  const opening = new Uint8Array(count), ball = new Uint8Array(count);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (insidePolygon(eye.opening, rx + x + 0.5, ry + y + 0.5)) opening[y * rw + x] = 1;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    let hit = 0;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < rw && ny < rh && opening[ny * rw + nx]) hit = 1;
    }
    ball[y * rw + x] = hit;
  }
  const at = (x: number, y: number) => ((ry + y) * image.width + rx + x) * 4;
  const core: number[][] = [];
  for (let k = 0; k < count; k++) if (opening[k]) {
    const i = at(k % rw, Math.floor(k / rw));
    if (image.data[i + 3] > 0) core.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
  }
  if (!core.length) throw new Error("An eye opening has no visible pixels; the bust cannot be rigged.");
  const bright = percentile(core.map((p) => luminance(p[0], p[1], p[2])), 85);
  const whites = core.filter((p) => luminance(p[0], p[1], p[2]) >= bright);
  const white = [0, 1, 2].map((k) => median(whites.map((p) => p[k])));
  const skin = skinColour(image, rect), skinLum = luminance(...skin.colour);
  const lums: number[] = [];
  for (let k = 0; k < count; k++) { const i = at(k % rw, Math.floor(k / rw)); if (image.data[i + 3] > 0) lums.push(luminance(image.data[i], image.data[i + 1], image.data[i + 2])); }
  const dark = lums.length ? percentile(lums, 10) : 0, creaseLum = (skinLum + dark) / 2;
  const creaseGap = Math.max(3, (eye.x1 - eye.x0) * 0.5);
  const masks = { ball, low: new Uint8Array(count), crease: new Uint8Array(count), lash: new Uint8Array(count) };
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const k = y * rw + x, i = at(x, y), px = rx + x + 0.5, py = ry + y + 0.5;
    const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    if (image.data[i + 3] === 0 || opening[k]) continue;
    if (Math.max(Math.abs(r - skin.colour[0]), Math.abs(g - skin.colour[1]), Math.abs(b - skin.colour[2])) < skin.tolerance) continue;
    const lum = luminance(r, g, b);
    if (Math.max(Math.abs(r - white[0]), Math.abs(g - white[1]), Math.abs(b - white[2])) < 20 && lum > skinLum) continue;
    const insideX = px >= eye.x0 && px <= eye.x1, u = (px - eye.x0) / (eye.x1 - eye.x0), top = sampled(eye.top, u);
    const corner = eye.top[0] + (eye.top[eye.top.length - 1] - eye.top[0]) * Math.min(1, Math.max(0, u));
    const upper = insideX ? py <= top + 3 : py <= corner + 2;
    if (insideX && py < top - creaseGap && lum > creaseLum) masks.crease[k] = 1;
    else if (upper) masks.lash[k] = 1;
    else masks.low[k] = 1;
  }
  return { masks, skin: skin.colour };
}

function crop(image: PixelImage, rect: Rect, mask: Uint8Array): PixelImage {
  const [rx, ry, rw, rh] = rect, data = new Uint8ClampedArray(rw * rh * 4);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const k = y * rw + x;
    if (!mask[k]) continue;
    const i = ((ry + y) * image.width + rx + x) * 4;
    data.set(image.data.subarray(i, i + 4), k * 4);
  }
  return { width: rw, height: rh, data };
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function neighbourMean(rgb: Float32Array, x: number, y: number, c: number, rw: number, rh: number): number {
  let sum = 0, n = 0;
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < rw && ny < rh) { sum += rgb[(ny * rw + nx) * 3 + c]; n += 1; }
  }
  return n ? sum / n : rgb[(y * rw + x) * 3 + c];
}

function diffuse(rgb: Float32Array, mask: Uint8Array, rw: number, rh: number): void {
  const next = new Float32Array(rgb);
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const x = k % rw, y = Math.floor(k / rw);
    for (let c = 0; c < 3; c++) next[k * 3 + c] = neighbourMean(rgb, x, y, c, rw, rh);
  }
  rgb.set(next);
}

function fillHoles(image: PixelImage, holes: Array<{ rect: Rect; mask: Uint8Array; skin: [number, number, number] }>): PixelImage {
  const data = new Uint8ClampedArray(image.data);
  for (const { rect: [rx, ry, rw, rh], mask, skin } of holes) {
    const rgb = new Float32Array(rw * rh * 3);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const k = y * rw + x, i = ((ry + y) * image.width + rx + x) * 4;
      for (let c = 0; c < 3; c++) rgb[k * 3 + c] = mask[k] ? skin[c] : data[i + c];
    }
    for (let pass = 0; pass < 40; pass++) diffuse(rgb, mask, rw, rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const k = y * rw + x;
      if (!mask[k]) continue;
      const i = ((ry + y) * image.width + rx + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(rgb[k * 3 + c]);
      data[i + 3] = 255;
    }
  }
  return { width: image.width, height: image.height, data };
}

export function cutHeadLayers(image: PixelImage, rig: Rig): CutLayer[] {
  if (image.width !== rig.image.width || image.height !== rig.image.height) throw new Error("The rig and the bust differ in size.");
  const eyes: CutLayer[] = [], holes: Array<{ rect: Rect; mask: Uint8Array; skin: [number, number, number] }> = [];
  rig.eyes.forEach((eye, index) => {
    const rect = roiRect(eye, image), { masks, skin } = eyeMasks(image, eye, rect);
    const hole = new Uint8Array(rect[2] * rect[3]);
    for (let k = 0; k < hole.length; k++) hole[k] = masks.ball[k] | masks.low[k] | masks.crease[k] | masks.lash[k];
    holes.push({ rect, mask: hole, skin });
    for (const part of PARTS) eyes.push({ name: `eye${index}_${part}`, rect, image: crop(image, rect, masks[part]) });
  });
  return [{ name: "base", rect: [0, 0, image.width, image.height], image: fillHoles(image, holes) }, ...eyes];
}

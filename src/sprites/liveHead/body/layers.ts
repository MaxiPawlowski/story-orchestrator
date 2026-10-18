import type { PixelImage } from "../../builder/pixels";
import { insideOutline } from "./geometry";
import type { BodyRig } from "./types";

export interface BodyCut { name: string; rect: [number, number, number, number]; image: PixelImage }
const OPAQUE = 128, PAD = 8, SPAN = 0.25, RAYS = 16;

function armMask(image: PixelImage, outline: [number, number][]): { rect: BodyCut["rect"]; mask: Uint8Array } | null {
  const DILATE = Math.max(2, Math.round(image.height * 0.004));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - PAD), y0 = Math.max(0, Math.floor(Math.min(...ys)) - PAD);
  const x1 = Math.min(image.width, Math.ceil(Math.max(...xs)) + PAD), y1 = Math.min(image.height, Math.ceil(Math.max(...ys)) + PAD);
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;
  const rw = x1 - x0, rh = y1 - y0, inside = new Uint8Array(rw * rh), mask = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (insideOutline(outline, x0 + x + 0.5, y0 + y + 0.5)) inside[y * rw + x] = 1;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    let hit = 0;
    for (let dy = -DILATE; dy <= DILATE && !hit; dy++) for (let dx = -DILATE; dx <= DILATE && !hit; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < rw && ny < rh && inside[ny * rw + nx]) hit = 1;
    }
    mask[y * rw + x] = hit;
  }
  return { rect: [x0, y0, rw, rh], mask };
}

function crop(image: PixelImage, rect: BodyCut["rect"], mask: Uint8Array): PixelImage {
  const [rx, ry, rw, rh] = rect, data = new Uint8ClampedArray(rw * rh * 4);
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const i = ((ry + Math.floor(k / rw)) * image.width + rx + k % rw) * 4;
    data.set(image.data.subarray(i, i + 4), k * 4);
  }
  return { width: rw, height: rh, data };
}

export function fillBehindArms(image: PixelImage, hole: Uint8Array): PixelImage {
  const { width, height } = image, src = image.data, data = new Uint8ClampedArray(src), limit = Math.round(SPAN * width);
  const rays = Array.from({ length: RAYS }, (_, k) => [Math.cos(k * Math.PI * 2 / RAYS), Math.sin(k * Math.PI * 2 / RAYS)]);
  const on = new Uint8Array(width * height), rgb = new Float32Array(width * height * 3);
  for (let k = 0; k < hole.length; k++) {
    if (!hole[k]) continue;
    const x0 = k % width, y0 = Math.floor(k / width);
    let weight = 0, opaqueWeight = 0, tintWeight = 0, r = 0, g = 0, b = 0;
    for (const [dx, dy] of rays) {
      for (let step = 1; step <= limit; step++) {
        const x = Math.round(x0 + dx * step), y = Math.round(y0 + dy * step);
        if (x < 0 || y < 0 || x >= width || y >= height) { weight += 1 / step; break; }
        const m = y * width + x;
        if (hole[m]) continue;
        const w = 1 / step;
        weight += w;
        if (src[m * 4 + 3] >= OPAQUE) { const tint = w * w * w; opaqueWeight += w; tintWeight += tint; r += src[m * 4] * tint; g += src[m * 4 + 1] * tint; b += src[m * 4 + 2] * tint; }
        break;
      }
    }
    if (weight > 0 && opaqueWeight / weight >= 0.5) { on[k] = 1; rgb[k * 3] = r / tintWeight; rgb[k * 3 + 1] = g / tintWeight; rgb[k * 3 + 2] = b / tintWeight; }
  }
  for (let k = 0; k < hole.length; k++) {
    if (!hole[k]) continue;
    for (let c = 0; c < 3; c++) data[k * 4 + c] = on[k] ? Math.round(rgb[k * 3 + c]) : 0;
    data[k * 4 + 3] = on[k] ? 255 : 0;
  }
  return { width, height, data };
}

export function cutBodyLayers(image: PixelImage, rig: BodyRig): BodyCut[] {
  if (image.width !== rig.image.width || image.height !== rig.image.height) throw new Error("The rig and the sprite differ in size.");
  const hole = new Uint8Array(image.width * image.height), arms: BodyCut[] = [];
  (rig.arms ?? []).forEach((arm, index) => {
    if (arm.state !== "free") return;
    const cut = armMask(image, arm.outline);
    if (!cut) return;
    const [rx, ry, rw] = cut.rect;
    for (let k = 0; k < cut.mask.length; k++) if (cut.mask[k]) hole[(ry + Math.floor(k / rw)) * image.width + rx + k % rw] = 1;
    arms.push({ name: `arm${index}`, rect: cut.rect, image: crop(image, cut.rect, cut.mask) });
  });
  return [{ name: "base", rect: [0, 0, image.width, image.height], image: arms.length ? fillBehindArms(image, hole) : image }, ...arms];
}

import type { PixelImage } from "../../builder/pixels";
import { insideOutline } from "./geometry";
import type { BodyRig } from "./types";

export interface BodyCut { name: string; rect: [number, number, number, number]; image: PixelImage }
const OPAQUE = 128, DILATE = 2, PAD = 4, SPAN = 0.45, PASSES = 12;
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function armMask(image: PixelImage, outline: [number, number][]): { rect: BodyCut["rect"]; mask: Uint8Array } | null {
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
  const { width, height } = image, src = image.data, data = new Uint8ClampedArray(src), filled = new Uint8Array(width * height);
  const opaque = (k: number) => !hole[k] && src[k * 4 + 3] >= OPAQUE;
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!hole[y * width + x]) { x++; continue; }
      let end = x;
      while (end < width && hole[y * width + end]) end++;
      const left = x - 1, right = end;
      const between = left >= 0 && right < width && opaque(y * width + left) && opaque(y * width + right) && right - left <= SPAN * width;
      if (between) for (let k = x; k < end; k++) filled[y * width + k] = 1;
      x = end;
    }
  }
  const smoothed = new Uint8Array(filled);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const k = y * width + x;
    if (!hole[k]) continue;
    let votes = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) votes += filled[k + dy * width + dx];
    smoothed[k] = votes >= 5 ? 1 : 0;
  }
  const rgb = new Float32Array(width * height * 3), seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  for (let k = 0; k < hole.length; k++) {
    if (!opaque(k)) continue;
    seen[k] = 1; queue[tail++] = k;
    for (let c = 0; c < 3; c++) rgb[k * 3 + c] = src[k * 4 + c];
  }
  while (head < tail) {
    const k = queue[head++], x = k % width, y = Math.floor(k / width);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx, ny = y + dy, n = ny * width + nx;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[n] || !hole[n]) continue;
      seen[n] = 1; queue[tail++] = n;
      for (let c = 0; c < 3; c++) rgb[n * 3 + c] = rgb[k * 3 + c];
    }
  }
  const next = new Float32Array(rgb);
  for (let pass = 0; pass < PASSES; pass++) {
    for (let k = 0; k < hole.length; k++) {
      if (!hole[k] || !smoothed[k]) continue;
      const x = k % width, y = Math.floor(k / width);
      for (let c = 0; c < 3; c++) {
        let sum = 0, n = 0;
        for (const [dx, dy] of NEIGHBOURS) {
          const nx = x + dx, ny = y + dy, m = ny * width + nx;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && (smoothed[m] || opaque(m))) { sum += rgb[m * 3 + c]; n++; }
        }
        next[k * 3 + c] = n ? sum / n : rgb[k * 3 + c];
      }
    }
    rgb.set(next);
  }
  for (let k = 0; k < hole.length; k++) {
    if (!hole[k]) continue;
    const on = smoothed[k] === 1;
    for (let c = 0; c < 3; c++) data[k * 4 + c] = on ? Math.round(rgb[k * 3 + c]) : 0;
    data[k * 4 + 3] = on ? 255 : 0;
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

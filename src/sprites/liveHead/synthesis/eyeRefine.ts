import type { PixelImage } from "../../builder/pixels";
import type { Point } from "../types";
import type { FaceLandmarks } from "./landmarks";
import { insidePolygon } from "./layers";
import { columnSpan } from "./rigGeometry";

export const EYE_GROW = { sideShare: 0.3, verticalShare: 0.35, maxWidth: 1.6, maxHeight: 2.2, skinHue: 0.12, scleraChroma: 34, scleraLum: 0.62, darkShare: 0.35, darkMax: 70, columns: 14 } as const;

const luminance = (r: number, g: number, b: number): number => r * 0.3 + g * 0.59 + b * 0.11;
const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];

function ringSkin(image: PixelImage, box: [number, number, number, number], ring: number): [number, number, number] | null {
  const [x0, y0, x1, y1] = box, pixels: Array<[number, number, number]> = [];
  for (let y = Math.max(0, y0 - ring); y < Math.min(image.height, y1 + ring); y++) for (let x = Math.max(0, x0 - ring); x < Math.min(image.width, x1 + ring); x++) {
    if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
    const i = (y * image.width + x) * 4;
    if (image.data[i + 3] > 200) pixels.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
  }
  if (pixels.length < 8) return null;
  const cut = median(pixels.map((p) => luminance(...p))), light = pixels.filter((p) => luminance(...p) >= cut);
  return [median(light.map((p) => p[0])), median(light.map((p) => p[1])), median(light.map((p) => p[2]))];
}

export function refineEye(image: PixelImage, contour: Point[]): Point[] {
  const xs = contour.map((p) => p[0]), ys = contour.map((p) => p[1]);
  const cx0 = Math.min(...xs), cx1 = Math.max(...xs), cy0 = Math.min(...ys), cy1 = Math.max(...ys), w = cx1 - cx0, h = cy1 - cy0;
  if (w < 4 || h < 2) return contour;
  const x0 = Math.max(0, Math.floor(cx0 - w * EYE_GROW.sideShare)), x1 = Math.min(image.width, Math.ceil(cx1 + w * EYE_GROW.sideShare));
  const y0 = Math.max(0, Math.floor(cy0 - h * EYE_GROW.verticalShare)), y1 = Math.min(image.height, Math.ceil(cy1 + h * EYE_GROW.verticalShare));
  const skin = ringSkin(image, [x0, y0, x1, y1], Math.max(3, Math.round(h * 0.6)));
  if (!skin) return contour;
  const skinSum = Math.max(1, skin[0] + skin[1] + skin[2]), skinHue = [skin[0] / skinSum, skin[1] / skinSum];
  const skinLum = luminance(...skin), dark = Math.min(EYE_GROW.darkMax, skinLum * EYE_GROW.darkShare);
  const bw = x1 - x0, bh = y1 - y0, mask = new Uint8Array(bw * bh), depth = new Int16Array(bw * bh).fill(-1), queue: number[] = [];
  const interior = (x: number, y: number): boolean => {
    const i = (y * image.width + x) * 4, r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    const lum = luminance(r, g, b);
    if (y > cy1 || image.data[i + 3] <= 200 || lum < dark) return false;
    if (Math.max(r, g, b) - Math.min(r, g, b) <= EYE_GROW.scleraChroma && lum >= skinLum * EYE_GROW.scleraLum) return true;
    const sum = Math.max(1, r + g + b);
    return Math.abs(r / sum - skinHue[0]) + Math.abs(g / sum - skinHue[1]) >= EYE_GROW.skinHue;
  };
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (insidePolygon(contour, x0 + x + 0.5, y0 + y + 0.5)) {
    const k = y * bw + x;
    mask[k] = 1; depth[k] = 0; queue.push(k);
  }
  if (!queue.length) return contour;
  const seeded = queue.length;
  const reach = Math.max(2, Math.round(w * EYE_GROW.sideShare));
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head], x = k % bw, y = Math.floor(k / bw);
    if (depth[k] >= reach) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * bw + nx;
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || mask[n] || !interior(x0 + nx, y0 + ny)) continue;
      mask[n] = 1; depth[n] = depth[k] + 1; queue.push(n);
    }
  }
  if (queue.length === seeded) return contour;
  const tops: Array<number | null> = [], bots: Array<number | null> = [];
  let left = bw, right = -1;
  for (let x = 0; x < bw; x++) {
    let top: number | null = null, bot: number | null = null;
    for (let y = 0; y < bh; y++) if (mask[y * bw + x]) { top ??= y; bot = y; }
    tops.push(top); bots.push(bot);
    if (top !== null) { left = Math.min(left, x); right = Math.max(right, x); }
  }
  if (right < 0 || right - left + 1 > w * EYE_GROW.maxWidth + 2) return contour;
  const spanOf = (x: number): [number, number] | null => tops[x] === null || bots[x] === null ? null : [y0 + (tops[x] as number), y0 + (bots[x] as number) + 1];
  const from = Math.min(cx0, x0 + left), to = Math.max(cx1, x0 + right + 1), top: Point[] = [], bottom: Point[] = [];
  for (let c = 0; c <= EYE_GROW.columns; c++) {
    const px = from + (to - from) * c / EYE_GROW.columns, column = Math.min(right, Math.max(left, Math.floor(px - x0)));
    let span = spanOf(column);
    for (let d = 1; !span && d < bw; d++) span = spanOf(column - d) ?? spanOf(column + d);
    if (!span) return contour;
    if (px > cx0 && px < cx1) {
      const [a, b] = columnSpan(contour, px);
      span = [Math.min(span[0], a), Math.max(span[1], b)];
    }
    top.push([px, span[0]]); bottom.push([px, span[1]]);
  }
  const height = Math.max(...bottom.map((p) => p[1])) - Math.min(...top.map((p) => p[1]));
  if (height > h * EYE_GROW.maxHeight + 2) return contour;
  const ends = [0, EYE_GROW.columns].map((k): Point => [top[k][0], (top[k][1] + bottom[k][1]) / 2]);
  return [ends[0], ...top.slice(1, -1), ends[1], ...bottom.slice(1, -1).reverse()];
}

export function refineEyes(image: PixelImage, marks: FaceLandmarks): FaceLandmarks {
  return { ...marks, eyes: [refineEye(image, marks.eyes[0]), refineEye(image, marks.eyes[1])] };
}

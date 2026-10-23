import type { PixelImage } from "../builder/pixels";
import type { Rect } from "./manifest";
import type { Eye } from "./types";

export type Tone = [number, number, number];
export type GazeMode = "dome" | "slide";

export const GAZE_TRAVEL = Object.freeze({ x: [7, 5.95] as const, y: 4.2 });
export const IRIS_EDGE = Object.freeze([0.1, 0.26] as const);
const MIN_SCLERA_PIXELS = 12, MIN_SCLERA_LUMA = 0.55, MAX_SCLERA_CHROMA = 0.1;

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function scleraTone(data: ArrayLike<number>): Tone | null {
  const opaque: Array<[number, number, number, number]> = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 230) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    if (Math.max(r, g, b) - Math.min(r, g, b) > MAX_SCLERA_CHROMA || luma(r, g, b) < MIN_SCLERA_LUMA) continue;
    opaque.push([luma(r, g, b), r, g, b]);
  }
  if (opaque.length < MIN_SCLERA_PIXELS) return null;
  opaque.sort((a, b) => b[0] - a[0]);
  const top = opaque.slice(0, Math.max(MIN_SCLERA_PIXELS, Math.ceil(opaque.length * 0.3)));
  const tone: Tone = [0, 0, 0];
  for (const [, r, g, b] of top) { tone[0] += r / top.length; tone[1] += g / top.length; tone[2] += b / top.length; }
  return luma(...tone) >= MIN_SCLERA_LUMA ? tone : null;
}

export const FALLBACK_SCLERA: Tone = [0.94, 0.94, 0.95];

export const eyeTone = (data: ArrayLike<number>): Tone => scleraTone(data) ?? FALLBACK_SCLERA;

export type Rgba = [number, number, number, number];

export function irisWeight(c: Rgba, tone: Tone): number {
  if (c[3] < 0.004) return 0;
  const r = c[0] / c[3] - tone[0], g = c[1] / c[3] - tone[1], b = c[2] / c[3] - tone[2];
  return smoothstep(IRIS_EDGE[0], IRIS_EDGE[1], Math.sqrt(r * r + g * g + b * b)) * smoothstep(0.25, 0.75, c[3]);
}

export const interior = (y: number, top: number, bot: number): number => smoothstep(0.5, 2.5, y - top) * smoothstep(0.5, 2.5, bot - y);

export function slideBall(here: Rgba, moved: Rgba, tone: Tone, inHere = 1, inMoved = 1, fill: Tone = tone): Rgba {
  const a = here[3], inv = 1 / Math.max(a, 1e-4), invMoved = 1 / Math.max(moved[3], 1e-4);
  const out: Rgba = [0, 0, 0, a], away = irisWeight(here, tone) * inHere, toward = irisWeight(moved, tone) * inMoved;
  for (let k = 0; k < 3; k++) {
    const h = here[k] * inv, m = moved[k] * invMoved;
    out[k] = Math.min(1, Math.max(0, h - away * (h - fill[k]) + toward * (m - fill[k]))) * a;
  }
  return out;
}

export type IrisSpan = [number, number];
export const IRIS_SPAN_EDGE = Object.freeze([1, 2.5] as const);

export const spanWeight = (x: number, span: IrisSpan | null): number =>
  span ? 1 - smoothstep(span[1] + IRIS_SPAN_EDGE[0], span[1] + IRIS_SPAN_EDGE[1], Math.abs(x - span[0])) : 1;

export function irisSpan(image: PixelImage, rect: Rect, eye: Eye, tone: Tone | null): IrisSpan | null {
  if (!tone) return null;
  const columns = new Array<number>(image.width).fill(0);
  for (let j = 0; j < image.height; j++) for (let i = 0; i < image.width; i++) {
    const at = (j * image.width + i) * 4, a = image.data[at + 3] / 255;
    if (a < 0.75) continue;
    const px = rect[0] + i + 0.5, py = rect[1] + j + 0.5, u = (px - eye.x0) / (eye.x1 - eye.x0);
    if (u <= 0 || u >= 1 || interior(py, curve(eye.top, u), curve(eye.bot, u)) < 0.99) continue;
    if (irisWeight([image.data[at] / 255 * a, image.data[at + 1] / 255 * a, image.data[at + 2] / 255 * a, a], tone) > 0.5) columns[i]++;
  }
  const peak = columns.indexOf(Math.max(...columns));
  if (columns[peak] < 2) return null;
  const floor = columns[peak] * 0.4;
  let a = peak, b = peak;
  while (a > 0 && columns[a - 1] >= floor) a--;
  while (b < columns.length - 1 && columns[b + 1] >= floor) b++;
  return [rect[0] + (a + b + 1) / 2, (b - a + 1) / 2];
}

export const IRIS_ROOM = 0.5;

export function gazeLimits(eye: Eye, span: IrisSpan | null): [number, number] | null {
  if (!span) return null;
  const heights = eye.top.map((top, i) => eye.bot[i] - top), floor = Math.max(...heights) * IRIS_ROOM;
  const first = heights.findIndex((height) => height >= floor), last = heights.length - 1 - [...heights].reverse().findIndex((height) => height >= floor);
  const at = (i: number): number => eye.x0 + (eye.x1 - eye.x0) * i / (heights.length - 1);
  return [Math.min(0, at(first) + span[1] - span[0]), Math.max(0, at(last) - span[1] - span[0])];
}

export const limitGaze = (dx: number, limits: [number, number] | null): number => limits ? Math.min(limits[1], Math.max(limits[0], dx)) : dx;

export function gazeOffset(eye: number, gazeX: number, gazeY: number): [number, number] {
  return [gazeX * GAZE_TRAVEL.x[eye === 1 ? 1 : 0], -gazeY * GAZE_TRAVEL.y];
}

const curve = (values: number[], u: number): number => {
  const f = Math.min(1, Math.max(0, u)) * 23, i = Math.min(Math.floor(f), 22);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
};

function premultipliedSampler(image: PixelImage, rect: Rect): (x: number, y: number) => Rgba {
  const texel = (i: number, j: number, k: number): number => {
    const x = Math.min(image.width - 1, Math.max(0, i)), y = Math.min(image.height - 1, Math.max(0, j)), at = (y * image.width + x) * 4;
    return k === 3 ? image.data[at + 3] / 255 : image.data[at + k] / 255 * (image.data[at + 3] / 255);
  };
  return (px, py) => {
    const tx = px - rect[0] - 0.5, ty = py - rect[1] - 0.5, i = Math.floor(tx), j = Math.floor(ty), fx = tx - i, fy = ty - j;
    const out: Rgba = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const top = texel(i, j, k) * (1 - fx) + texel(i + 1, j, k) * fx, bottom = texel(i, j + 1, k) * (1 - fx) + texel(i + 1, j + 1, k) * fx;
      out[k] = top * (1 - fy) + bottom * fy;
    }
    return out;
  };
}

export function bandFill(sample: (x: number, y: number) => Rgba, eye: Eye, span: IrisSpan | null, px: number, py: number, top: number, bot: number, tone: Tone): Tone {
  if (!span || interior(py, top, bot) >= 1) return tone;
  const reach = span[1] + IRIS_SPAN_EDGE[1] + 0.5, near = px < span[0] ? -1 : 1;
  const at = (x: number): number => Math.min(1, Math.max(0, (x - eye.x0) / (eye.x1 - eye.x0)));
  const open = (x: number): number => curve(eye.bot, at(x)) - curve(eye.top, at(x));
  const xn = span[0] + near * reach, xf = span[0] - near * reach, xe = open(xf) > open(xn) ? xf : xn, ue = at(xe);
  const edge = sample(xe, py - top < bot - py ? curve(eye.top, ue) + (py - top) : curve(eye.bot, ue) - (bot - py));
  return edge[3] < 0.5 ? tone : [edge[0] / edge[3], edge[1] / edge[3], edge[2] / edge[3]];
}

export function renderOpenBall(image: PixelImage, rect: Rect, eye: Eye, offset: [number, number], mode: GazeMode, tone: Tone | null, span: IrisSpan | null = null): PixelImage {
  const sample = premultipliedSampler(image, rect), data = new Uint8ClampedArray(rect[2] * rect[3] * 4);
  const still = offset[0] === 0 && offset[1] === 0;
  for (let j = 0; j < rect[3]; j++) for (let i = 0; i < rect[2]; i++) {
    const px = rect[0] + i + 0.5, py = rect[1] + j + 0.5;
    const u = Math.min(1, Math.max(0, (px - eye.x0) / (eye.x1 - eye.x0))), top = curve(eye.top, u), bot = curve(eye.bot, u);
    const v = Math.min(1, Math.max(0, (py - top) / Math.max(bot - top, 1)));
    let c: Rgba;
    if (mode === "dome" || !tone || still) {
      const w = Math.sqrt(4 * u * (1 - u)) * Math.sqrt(4 * v * (1 - v));
      c = sample(px - offset[0] * w, py - offset[1] * w);
    } else {
      const qx = px - offset[0], qy = py - offset[1], uq = Math.min(1, Math.max(0, (qx - eye.x0) / (eye.x1 - eye.x0)));
      const trust = (x: number, y: number, t: number, b: number): number => {
        const inside = interior(y, t, b), inward = y + (y - t < b - y ? 2.5 : -2.5);
        return inside >= 1 ? 1 : Math.max(inside, irisWeight(sample(x, inward), tone) * interior(inward, t, b));
      };
      const here = sample(px, py), held = spanWeight(px, span), band = bandFill(sample, eye, span, px, py, top, bot, tone);
      const fill = band.map((value, k) => tone[k] + (value - tone[k]) * held) as Tone;
      const kept = Math.min(1, (1 - held) * irisWeight(here, tone) + held * irisWeight([...fill, 1], tone));
      const inMoved = trust(qx, qy, curve(eye.top, uq), curve(eye.bot, uq)) * spanWeight(qx, span) * (1 - kept);
      c = slideBall(here, sample(qx, qy), tone, trust(px, py, top, bot) * held, inMoved, fill);
    }
    const lid = smoothstep(top - 1, top + 0.5, py) * (1 - smoothstep(bot - 0.9, bot + 0.6, py)), at = (j * rect[2] + i) * 4;
    for (let k = 0; k < 4; k++) data[at + k] = Math.round(c[k] * lid * 255);
  }
  return { width: rect[2], height: rect[3], data };
}

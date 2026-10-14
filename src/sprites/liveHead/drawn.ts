/*! Adapted from mesh-avatar-studio 26243f9 (packages/runtime/src/engine/sprites.js).
MIT License

Copyright (c) 2026 Yuki Shindo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import type { RunGuard } from "@runtime/runToken";
import type { AnimationFrames } from "../animation";
import type { HeadBox, PixelImage } from "../builder/pixels";
import type { HeadParameters } from "./drivers";
import type { Rect } from "./manifest";
import type { Rig } from "./types";

export const DRAWN_RECIPE = { id: "live-head-drawn-frames", version: 1 } as const;
export const DRAWN_FRAMES = ["blink", "talk", "talk2"] as const;
export type DrawnFrame = typeof DRAWN_FRAMES[number];
export type DrawnName = "eyes_closed_0" | "eyes_closed_1" | "mouth_talk" | "mouth_talk2";
export interface DrawnSource { frames: AnimationFrames; box?: HeadBox }
export interface DrawnSprite { name: DrawnName; rect: Rect; pixels: Uint8Array }
export interface DrawnSet { key: string; sprites: DrawnSprite[]; refused: string[] }
export interface DrawnDeps {
  bytes(url: string, signal: AbortSignal): Promise<ArrayBuffer>;
  hash(bytes: ArrayBuffer): Promise<string>;
  pixels(bytes: ArrayBuffer, signal: AbortSignal): Promise<PixelImage>;
}

const RING = 3, RING_DRIFT = 20, OPAQUE = 240;
const EYE_CLOSED_MAX = 0.3, EYE_FADE_MS = 60, MOUTH_OPEN_MIN = 0.16, MOUTH_FADE = 0.04;

export const drawnFrames = (source: DrawnSource | undefined): Array<[DrawnFrame, string]> =>
  DRAWN_FRAMES.flatMap((key) => (source?.frames[key] ? [[key, source.frames[key]] as [DrawnFrame, string]] : []));

export function drawnLineage(artHash: string, source: DrawnSource, frames: Partial<Record<DrawnFrame, { path: string; sha256: string }>>): string {
  return JSON.stringify({ recipe: DRAWN_RECIPE, art: artHash, box: source.box ?? null,
    frames: DRAWN_FRAMES.map((key) => [key, frames[key]?.path ?? null, frames[key]?.sha256 ?? null]) });
}

interface Window { image: PixelImage; x: number; y: number }

function frameWindow(rig: Rig, image: PixelImage, box: HeadBox | undefined): Window | string {
  const { width, height } = rig.image;
  if (!box) return image.width === width && image.height === height ? { image, x: 0, y: 0 } : "frame size differs from the rig artwork";
  if (box.width !== width || box.height !== height) return "head box differs from the rig artwork";
  if (box.x < 0 || box.y < 0 || box.x + box.width > image.width || box.y + box.height > image.height) return "head box falls outside the frame";
  return { image, x: box.x, y: box.y };
}

const at = (view: Window, x: number, y: number): number => ((view.y + y) * view.image.width + view.x + x) * 4;

function cut(view: Window, art: PixelImage, rect: Rect, weight: (x: number, y: number) => number, guard: (x: number, y: number) => boolean): { pixels: Uint8Array; drift: number; ring: number } {
  const [rx, ry, rw, rh] = rect, pixels = new Uint8Array(rw * rh * 4), source = view.image.data;
  let drift = 0, ring = 0;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const from = at(view, rx + x, ry + y), to = (y * rw + x) * 4, border = Math.min(x + 0.5, y + 0.5, rw - x - 0.5, rh - y - 0.5);
    const alpha = source[from + 3] / 255 * Math.min(1, border / RING) * weight(rx + x, ry + y);
    for (let channel = 0; channel < 3; channel++) pixels[to + channel] = Math.round(source[from + channel] * alpha);
    pixels[to + 3] = Math.round(alpha * 255);
    const base = ((ry + y) * art.width + rx + x) * 4;
    if (border < RING && source[from + 3] >= OPAQUE && art.data[base + 3] >= OPAQUE && guard(rx + x, ry + y)) {
      drift += Math.max(Math.abs(source[from] - art.data[base]), Math.abs(source[from + 1] - art.data[base + 1]), Math.abs(source[from + 2] - art.data[base + 2]));
      ring++;
    }
  }
  return { pixels, drift: ring ? drift / ring : 0, ring };
}

const clampRect = (rig: Rig, x0: number, y0: number, x1: number, y1: number): Rect | null => {
  const left = Math.max(0, Math.floor(x0)), top = Math.max(0, Math.floor(y0));
  const right = Math.min(rig.image.width, Math.ceil(x1)), bottom = Math.min(rig.image.height, Math.ceil(y1));
  return right - left >= 4 && bottom - top >= 4 ? [left, top, right - left, bottom - top] : null;
};

function eyeSprites(rig: Rig, view: Window, art: PixelImage, refused: string[]): DrawnSprite[] {
  return rig.eyes.flatMap((eye, index): DrawnSprite[] => {
    const xs = eye.roi.map((point) => point[0]), ys = eye.roi.map((point) => point[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), margin = Math.max(4, Math.round((y1 - y0) * 0.35));
    const rect = clampRect(rig, x0 - margin, y0 - margin, x1 + margin, y1 + margin);
    if (!rect) { refused.push(`blink: eye ${index} has no room`); return []; }
    let covered = 0, total = 0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(rig.image.height, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(rig.image.width, Math.ceil(x1)); x++) {
      total++; if (view.image.data[at(view, x, y) + 3] > 8) covered++;
    }
    if (!total || covered < total / 2) { refused.push(`blink: frame does not cover eye ${index}`); return []; }
    const sprite = cut(view, art, rect, () => 1, () => true);
    if (sprite.drift > RING_DRIFT) { refused.push(`blink: eye ${index} edge drifts ${sprite.drift.toFixed(1)} levels from the artwork`); return []; }
    return [{ name: `eyes_closed_${index}` as DrawnName, rect, pixels: sprite.pixels }];
  });
}

function mouthSprite(rig: Rig, view: Window, art: PixelImage, key: "talk" | "talk2", refused: string[]): DrawnSprite[] {
  const area = rig.mouth.area, cos = Math.cos(area.angle), sin = Math.sin(area.angle);
  const hx = Math.hypot(area.rx * cos, area.ry * sin) * 2.5, hy = Math.hypot(area.rx * sin, area.ry * cos) * 2.5;
  const search = clampRect(rig, area.cx - hx, area.cy - hy, area.cx + hx, area.cy + hy);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (search) for (let y = search[1]; y < search[1] + search[3]; y++) for (let x = search[0]; x < search[0] + search[2]; x++) {
    if (view.image.data[at(view, x, y) + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  }
  const rect = Number.isFinite(x0) ? clampRect(rig, x0 - 1, y0 - 1, x1 + 1, y1 + 1) : null;
  if (!rect) { refused.push(`${key}: frame has no mouth near the rig's mouth`); return []; }
  const outside = (x: number, y: number) => {
    const dx = x + 0.5 - area.cx, dy = y + 0.5 - area.cy, u = (dx * cos + dy * sin) / area.rx, v = (-dx * sin + dy * cos) / area.ry;
    return u * u + v * v > 1.96;
  };
  const sprite = cut(view, art, rect, () => 1, outside);
  if (sprite.drift > RING_DRIFT) { refused.push(`${key}: mouth edge drifts ${sprite.drift.toFixed(1)} levels from the artwork`); return []; }
  return [{ name: key === "talk" ? "mouth_talk" : "mouth_talk2", rect, pixels: sprite.pixels }];
}

export function cutDrawn(rig: Rig, art: PixelImage, frames: Partial<Record<DrawnFrame, PixelImage>>, box?: HeadBox): { sprites: DrawnSprite[]; refused: string[] } {
  const refused: string[] = [], sprites: DrawnSprite[] = [];
  if (art.width !== rig.image.width || art.height !== rig.image.height) return { sprites, refused: ["artwork size differs from the rig"] };
  for (const key of DRAWN_FRAMES) {
    const image = frames[key];
    if (!image) continue;
    const view = frameWindow(rig, image, box);
    if (typeof view === "string") { refused.push(`${key}: ${view}`); continue; }
    sprites.push(...(key === "blink" ? eyeSprites(rig, view, art, refused) : mouthSprite(rig, view, art, key, refused)));
  }
  return { sprites, refused };
}

export async function prepareDrawn(rig: Rig, artHash: string, art: ArrayBuffer, source: DrawnSource, run: RunGuard, deps: DrawnDeps): Promise<DrawnSet | null> {
  const listed = drawnFrames(source);
  if (!listed.length || !run.stillOwns()) return null;
  const images: Partial<Record<DrawnFrame, PixelImage>> = {}, sources: Partial<Record<DrawnFrame, { path: string; sha256: string }>> = {};
  for (const [key, path] of listed) {
    const bytes = await deps.bytes(path, run.signal);
    if (!run.stillOwns()) return null;
    const sha256 = await deps.hash(bytes);
    if (!run.stillOwns()) return null;
    images[key] = await deps.pixels(bytes, run.signal);
    if (!run.stillOwns()) return null;
    sources[key] = { path, sha256 };
  }
  const artPixels = await deps.pixels(art, run.signal);
  if (!run.stillOwns()) return null;
  const key = await deps.hash(new TextEncoder().encode(drawnLineage(artHash, source, sources)).buffer as ArrayBuffer);
  if (!run.stillOwns()) return null;
  return { key, ...cutDrawn(rig, artPixels, images, source.box) };
}

const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const VOWELS: Array<[string, number, number]> = [["i", -9, -0.55], ["e", -0.55, -0.2], ["a", -0.2, 0.35], ["o", 0.35, 0.75], ["u", 0.75, 9]];
export function classifyVowel(form: number, previous: string | null): string {
  const pad = previous ? 0.07 : 0;
  const was = previous ? VOWELS.find((region) => region[0] === previous) : undefined;
  if (was && form >= was[1] - pad && form < was[2] + pad) return was[0];
  return (VOWELS.find((region) => form >= region[1] && form < region[2]) ?? VOWELS[2])[0];
}

const WIDTH: Record<string, number> = { e: 1.06, u: 0.78 };

export interface DrawnState {
  eyes: [number, number];
  covered: [boolean, boolean];
  mouth: DrawnName | null;
  mouthAlpha: number;
  squash: number;
  width: number;
  shaderMouth: number;
}

export class DrawnDirector {
  readonly state: DrawnState = { eyes: [0, 0], covered: [false, false], mouth: null, mouthAlpha: 0, squash: 1, width: 1, shaderMouth: 0 };
  private readonly eyeFrames = [0, 1].map(() => ({ closed: false, was: false, t: 1 }));
  private vowel: string | null = null;
  constructor(private readonly names: ReadonlySet<DrawnName>) {}

  update(p: HeadParameters, dtMs: number): DrawnState {
    const state = this.state;
    for (let index = 0; index < 2; index++) {
      const frame = this.eyeFrames[index], drawn = this.names.has(index === 0 ? "eyes_closed_0" : "eyes_closed_1");
      const closed = drawn && p.eyeOpen < EYE_CLOSED_MAX;
      if (closed !== frame.closed) { frame.was = frame.closed; frame.closed = closed; frame.t = 0; }
      frame.t = dtMs > 0 ? Math.min(1, frame.t + dtMs / EYE_FADE_MS) : 1;
      const k = sstep(0, 1, frame.t);
      state.eyes[index] = frame.closed ? (frame.t >= 1 ? 1 : k) : frame.was && frame.t < 1 ? 1 - k : 0;
      state.covered[index] = frame.closed && k >= 0.999;
    }
    const talk = this.names.has("mouth_talk"), talk2 = this.names.has("mouth_talk2");
    state.mouth = null; state.mouthAlpha = 0; state.squash = 1; state.width = 1;
    if ((talk || talk2) && p.mouthOpen >= MOUTH_OPEN_MIN) {
      this.vowel = classifyVowel(p.mouthForm, this.vowel);
      const wide = p.mouthOpen >= 0.6 && this.vowel === "a";
      const name: DrawnName = (wide && talk) || !talk2 ? "mouth_talk" : "mouth_talk2";
      const ref = name === "mouth_talk" ? 0.9 : this.vowel === "e" ? 0.65 : 0.55;
      state.mouth = name; state.mouthAlpha = sstep(MOUTH_OPEN_MIN, MOUTH_OPEN_MIN + MOUTH_FADE, p.mouthOpen);
      state.squash = Math.min(1.1, Math.max(0.5, p.mouthOpen / ref)); state.width = WIDTH[this.vowel] ?? 1;
    } else this.vowel = null;
    state.shaderMouth = talk || talk2 ? 0 : p.mouthOpen;
    return state;
  }
}

export function mouthInner(rig: Rig, x: number, y: number): number {
  const area = rig.mouth.area, c = Math.cos(-area.angle), s = Math.sin(-area.angle);
  const dx = x - area.cx, dy = y - area.cy;
  const u = (dx * c - dy * s) / area.rx, v = (dx * s + dy * c) / area.ry;
  return 1 - sstep(0.55, 0.95, Math.hypot(u, v));
}

export function squashVertex(rig: Rig, x: number, y: number, inner: number, squash: number, width: number, out: Float32Array, at: number): void {
  if (inner <= 0) { out[at] = x; out[at + 1] = y; return; }
  const line = rig.mouth.cy + (x - rig.mouth.cx) * Math.tan(rig.mouth.angle), center = rig.mouth.area.cx;
  out[at] = center + (x - center) * (1 + (width - 1) * inner);
  out[at + 1] = line + (y - line) * (1 + (squash - 1) * inner);
}

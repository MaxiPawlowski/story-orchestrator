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
import { bustBox } from "../builder/headBox";
import type { RunGuard } from "@runtime/runToken";
import { FRAME_KEYS, type AnimationFrames, type MouthFrameKey } from "../frameKeys";
import { classifyVowel as classifyMouthVowel } from "../mouthShape";
import { DEFAULT_MOUTH_CONFIG, type MouthConfig, type MouthShape, type Vowel } from "../mouthConfig";
import { usesDrawnMouth as usesDrawn } from "./meshMouth";
import type { HeadBox, PixelImage } from "../builder/pixels";
import type { HeadParameters } from "./drivers";
import type { Rect } from "./manifest";
import type { Rig } from "./types";

export const DRAWN_RECIPE = { id: "live-head-drawn-frames", version: 2 } as const;
export const DRAWN_FRAMES = FRAME_KEYS;
export type DrawnFrame = typeof DRAWN_FRAMES[number];
export const MOUTH_SPRITES = { talk: "mouth_talk", talk2: "mouth_talk2", mouth_o: "mouth_o", mouth_wide: "mouth_wide" } as const satisfies Record<MouthFrameKey, string>;
export type MouthSpriteName = typeof MOUTH_SPRITES[MouthFrameKey];
export type DrawnName = "eyes_closed_0" | "eyes_closed_1" | MouthSpriteName;
export interface DrawnSource { frames: AnimationFrames; box?: HeadBox }
export interface DrawnSprite { name: DrawnName; rect: Rect; pixels: Uint8Array }
export interface DrawnSet { key: string; sprites: DrawnSprite[]; refused: string[] }
export interface DrawnDeps {
  bytes(url: string, signal: AbortSignal): Promise<ArrayBuffer>;
  hash(bytes: ArrayBuffer): Promise<string>;
  pixels(bytes: ArrayBuffer, signal: AbortSignal): Promise<PixelImage>;
}

const RING = 3, RING_DRIFT = 20, OPAQUE = 240;
const EYE_CLOSED_MAX = 0.3, EYE_FADE_MS = 60;

export const drawnFrames = (source: DrawnSource | undefined): Array<[DrawnFrame, string]> =>
  DRAWN_FRAMES.flatMap((key) => (source?.frames[key] ? [[key, source.frames[key]] as [DrawnFrame, string]] : []));

export function drawnLineage(artHash: string, source: DrawnSource, frames: Partial<Record<DrawnFrame, { path: string; sha256: string }>>): string {
  return JSON.stringify({ recipe: DRAWN_RECIPE, art: artHash, box: source.box ?? null,
    frames: DRAWN_FRAMES.map((key) => [key, frames[key]?.path ?? null, frames[key]?.sha256 ?? null]) });
}

export interface Window { image: PixelImage; x: number; y: number }

export function frameWindow(rig: Rig, image: PixelImage, box: HeadBox | undefined): Window | string {
  const { width, height } = rig.image;
  if (!box) return image.width === width && image.height === height ? { image, x: 0, y: 0 } : "frame size differs from the rig artwork";
  const crop = box.width === width && box.height === height ? box : bustBox(image, box);
  if (crop.width !== width || crop.height !== height) return "head box differs from the rig artwork";
  if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > image.width || crop.y + crop.height > image.height) return "head box falls outside the frame";
  return { image, x: crop.x, y: crop.y };
}

const at = (view: Window, x: number, y: number): number => ((view.y + y) * view.image.width + view.x + x) * 4;

export function rigWindow(rig: Rig, image: PixelImage, box: HeadBox | undefined): PixelImage | string {
  const view = frameWindow(rig, image, box);
  return typeof view === "string" ? view : windowPixels(rig, view);
}

export function windowPixels(rig: Rig, view: Window): PixelImage {
  const image = view.image, { width, height } = rig.image, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) data.set(image.data.subarray(at(view, 0, y), at(view, width, y)), y * width * 4);
  return { width, height, data };
}

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

function mouthSprite(rig: Rig, view: Window, art: PixelImage, key: MouthFrameKey, refused: string[]): DrawnSprite[] {
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
  return [{ name: MOUTH_SPRITES[key], rect, pixels: sprite.pixels }];
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

export function classifyVowel(form: number, previous: string | null, config: MouthConfig = DEFAULT_MOUTH_CONFIG): string {
  return classifyMouthVowel(form, previous, config);
}

const MOUTH_KEYS = Object.keys(MOUTH_SPRITES) as MouthFrameKey[];

export interface DrawnState {
  eyes: [number, number];
  covered: [boolean, boolean];
  mouth: DrawnName | null;
  mouthAlpha: number;
  mouthFrom: DrawnName | null;
  mouthFromAlpha: number;
  squash: number;
  width: number;
  shaderMouth: number;
}

export class DrawnDirector {
  readonly state: DrawnState = { eyes: [0, 0], covered: [false, false], mouth: null, mouthAlpha: 0, mouthFrom: null, mouthFromAlpha: 0, squash: 1, width: 1, shaderMouth: 0 };
  private readonly eyeFrames = [0, 1].map(() => ({ closed: false, was: false, t: 1 }));
  private vowel: string | null = null;
  private readonly mouths: MouthFrameKey[];
  private shown: DrawnName | null = null;
  private from: DrawnName | null = null;
  private fade = 1;
  private held = Infinity;
  constructor(private readonly names: ReadonlySet<DrawnName>, private readonly config: MouthConfig = DEFAULT_MOUTH_CONFIG) {
    this.mouths = usesDrawn(config) ? MOUTH_KEYS.filter((key) => names.has(MOUTH_SPRITES[key])) : [];
  }

  hasMouth(): boolean { return this.mouths.length > 0; }

  update(p: HeadParameters, dtMs: number): DrawnState {
    const state = this.state, config = this.config, drawnConfig = config.drawn;
    for (let index = 0; index < 2; index++) {
      const frame = this.eyeFrames[index], drawn = this.names.has(index === 0 ? "eyes_closed_0" : "eyes_closed_1");
      const closed = drawn && p.eyeOpen < EYE_CLOSED_MAX;
      if (closed !== frame.closed) { frame.was = frame.closed; frame.closed = closed; frame.t = 0; }
      frame.t = dtMs > 0 ? Math.min(1, frame.t + dtMs / EYE_FADE_MS) : 1;
      const k = sstep(0, 1, frame.t);
      state.eyes[index] = frame.closed ? (frame.t >= 1 ? 1 : k) : frame.was && frame.t < 1 ? 1 - k : 0;
      state.covered[index] = frame.closed && k >= 0.999;
    }
    const mouths = this.mouths, step = dtMs > 0 && Number.isFinite(dtMs) ? dtMs : 0;
    let wanted: DrawnName | null = null, alpha = 0;
    state.squash = 1; state.width = 1;
    if (mouths.length && p.mouthOpen >= config.openMin) {
      this.vowel = classifyMouthVowel(p.mouthForm, this.vowel, config);
      const shape = (this.vowel === "a" ? (p.mouthOpen >= config.wideOpen ? "a" : "aHalf") : this.vowel) as MouthShape;
      const key = config.chains[shape].find((entry) => mouths.includes(entry)) ?? mouths[0];
      const ref = key === "talk2" && this.vowel === "e" ? drawnConfig.halfRefForE : drawnConfig.refs[key];
      wanted = MOUTH_SPRITES[key]; alpha = sstep(config.openMin, config.openMin + drawnConfig.fade, p.mouthOpen);
      state.squash = Math.min(drawnConfig.squashMax, Math.max(drawnConfig.squashMin, p.mouthOpen / ref));
      state.width = drawnConfig.widths[this.vowel as Vowel] ?? 1;
    } else this.vowel = null;
    this.held += step;
    if (wanted !== this.shown && (wanted === null || this.shown === null || this.held >= drawnConfig.holdMs)) {
      this.from = wanted && this.shown && drawnConfig.crossfadeMs > 0 ? this.shown : null;
      this.fade = this.from ? 0 : 1;
      this.shown = wanted; this.held = 0;
    }
    if (this.from) this.fade = step > 0 ? Math.min(1, this.fade + step / drawnConfig.crossfadeMs) : 1;
    if (this.fade >= 1) this.from = null;
    const k = this.from ? sstep(0, 1, this.fade) : 1;
    state.mouth = this.shown; state.mouthAlpha = this.shown ? alpha * k : 0;
    state.mouthFrom = this.from; state.mouthFromAlpha = this.from ? alpha * (1 - k) : 0;
    state.shaderMouth = mouths.length ? 0 : p.mouthOpen;
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

import type { RunGuard } from "@runtime/runToken";
import type { HeadBox, PixelImage } from "../builder/pixels";
import type { AnimationFrames } from "../frameKeys";
import type { Eye, Rig } from "./types";
import type { HeadLayer, Rect } from "./manifest";
import { cutHeadLayers, insidePolygon, type CutLayer } from "./synthesis/layers";
import { cutDrawn, drawnFrames, frameWindow, rigWindow, windowPixels, type DrawnDeps, type DrawnFrame, type DrawnSprite } from "./drawn";
import { eyeTone, gazeOffset, interior, irisSpan, renderOpenBall } from "./gaze";

export interface ExpressionArt { art: string; frames: AnimationFrames }
export interface ExpressionSources { box?: HeadBox; looks: Record<string, ExpressionArt> }
export interface PreparedLook { name: string; layers: CutLayer[]; sprites: DrawnSprite[]; refused: string[]; gaze: [boolean, boolean] }
export interface LookSurface { addLook(look: PreparedLook): void; showLook(name: string | null, cut: boolean): void }

export const ALIGN_LEVEL = 24;
export const ALIGN_STRAY = 8;
export const ALIGN_HEAD = 1.6;
export const SQUINT_LIMIT = 0.7;
const MIN_SCLERA = 12;
export const LOOK_CACHE_SIZE = 24;
export const PRELOAD_MS = 1200;
export const PRELOAD_COUNT = 4;
const GAZE_STEPS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

const FAMILIES: Readonly<Record<string, readonly string[]>> = {
  happy: ["joy", "amusement", "love", "excitement", "admiration", "approval", "gratitude", "caring", "optimism", "pride", "relief", "smile", "smug"],
  angry: ["anger", "annoyance", "disgust", "disapproval", "rage", "irritation", "irritated"],
  worried: ["worry", "sad", "sadness", "fear", "nervousness", "grief", "remorse", "disappointment", "concern", "anxious", "anxiety"],
};

export function expressionTexture(label: string, available: readonly string[]): string | null {
  const wanted = label.toLowerCase();
  if (!wanted || wanted === "neutral") return null;
  const exact = available.find((name) => name.toLowerCase() === wanted);
  if (exact) return exact;
  const family = Object.entries(FAMILIES).find(([key, members]) => key === wanted || members.includes(wanted))?.[0];
  return family ? available.find((name) => name.toLowerCase() === family) ?? null : null;
}

const changed = (a: PixelImage, b: PixelImage, at: number): boolean =>
  Math.max(Math.abs(a.data[at] - b.data[at]), Math.abs(a.data[at + 1] - b.data[at + 1]), Math.abs(a.data[at + 2] - b.data[at + 2]),
    Math.abs(a.data[at + 3] - b.data[at + 3])) > ALIGN_LEVEL;

export function alignmentProblem(rig: Rig, neutral: PixelImage, image: PixelImage, region?: Rect): string | null {
  if (neutral.width !== rig.image.width || neutral.height !== rig.image.height || image.width !== neutral.width || image.height !== neutral.height)
    return "the expression art differs in size from the rig";
  const head = rig.head, rx = head.rx * ALIGN_HEAD, ry = head.ry * ALIGN_HEAD;
  const inside = region ? (x: number, y: number) => x >= region[0] && y >= region[1] && x < region[0] + region[2] && y < region[1] + region[3]
    : (x: number, y: number) => ((x + 0.5 - head.cx) / rx) ** 2 + ((y + 0.5 - head.cy) / ry) ** 2 <= 1;
  let moved = 0, outside = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (!changed(neutral, image, (y * image.width + x) * 4)) continue;
    moved++;
    if (!inside(x, y)) outside++;
  }
  if (!moved) return "the expression art is identical to the neutral art";
  return outside > ALIGN_STRAY ? `${outside} changed pixels fall outside the head box, so the art is not aligned with the rig` : null;
}

export function scleraPixels(eye: Eye, image: PixelImage): number {
  const xs = eye.opening.map((point) => point[0]), ys = eye.opening.map((point) => point[1]);
  let pale = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(image.height, Math.ceil(Math.max(...ys))); y++)
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(image.width, Math.ceil(Math.max(...xs))); x++) {
      if (!insidePolygon(eye.opening, x + 0.5, y + 0.5)) continue;
      const at = (y * image.width + x) * 4, r = image.data[at] / 255, g = image.data[at + 1] / 255, b = image.data[at + 2] / 255;
      if (image.data[at + 3] >= 230 && Math.max(r, g, b) - Math.min(r, g, b) <= 0.1 && 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.55) pale++;
    }
  return pale;
}

export function squinted(eye: Eye, neutral: PixelImage, image: PixelImage): boolean {
  const before = scleraPixels(eye, neutral);
  return before >= MIN_SCLERA && scleraPixels(eye, image) < before * SQUINT_LIMIT;
}

const along = (values: number[], u: number): number => {
  const f = Math.min(1, Math.max(0, u)) * (values.length - 1), i = Math.min(Math.floor(f), values.length - 2);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
};

export function seeThrough(ball: CutLayer, eye: Eye, index: number): number {
  const tone = eyeTone(ball.image.data), span = irisSpan(ball.image, ball.rect, eye, tone), [rx, ry] = ball.rect;
  let total = 0;
  for (const gx of GAZE_STEPS) for (const gy of GAZE_STEPS) {
    const out = renderOpenBall(ball.image, ball.rect, eye, gazeOffset(index, gx, gy), "slide", tone, span);
    for (let k = 0; k < out.width * out.height; k++) {
      const px = rx + k % out.width + 0.5, py = ry + Math.floor(k / out.width) + 0.5, u = (px - eye.x0) / (eye.x1 - eye.x0);
      if (u <= 0.05 || u >= 0.95 || interior(py, along(eye.top, u) + 1, along(eye.bot, u) - 1) < 1 || ball.image.data[k * 4 + 3] < 230) continue;
      if (out.data[k * 4 + 3] < 230) total++;
    }
  }
  return total;
}

export function lookArt(rig: Rig, image: PixelImage, box: HeadBox | undefined): { image: PixelImage; region?: Rect } | string {
  const view = frameWindow(rig, image, box);
  if (typeof view === "string") return view;
  return { image: windowPixels(rig, view), ...(box ? { region: [box.x - view.x, box.y - view.y, box.width, box.height] as Rect } : {}) };
}

export function holes(ball: CutLayer, eye: Eye): number {
  const [rx, ry, rw, rh] = ball.rect;
  let open = 0;
  for (let k = 0; k < rw * rh; k++) {
    const px = rx + k % rw + 0.5, py = ry + Math.floor(k / rw) + 0.5, u = (px - eye.x0) / (eye.x1 - eye.x0);
    if (u <= 0.05 || u >= 0.95 || interior(py, along(eye.top, u) + 1, along(eye.bot, u) - 1) < 1) continue;
    if (ball.image.data[k * 4 + 3] < 230) open++;
  }
  return open;
}

export function fitLayer(layer: CutLayer, rect: Rect): CutLayer {
  if (rect.every((value, k) => value === layer.rect[k])) return layer;
  const [x, y, width, height] = rect, data = new Uint8ClampedArray(width * height * 4), [lx, ly, lw, lh] = layer.rect;
  for (let row = Math.max(y, ly); row < Math.min(y + height, ly + lh); row++) for (let column = Math.max(x, lx); column < Math.min(x + width, lx + lw); column++) {
    const from = ((row - ly) * lw + column - lx) * 4;
    data.set(layer.image.data.subarray(from, from + 4), ((row - y) * width + column - x) * 4);
  }
  return { name: layer.name, rect: [...rect], image: { width, height, data } };
}

export function cutLook(rig: Rig, name: string, neutral: PixelImage, art: { image: PixelImage; region?: Rect }, frames: Partial<Record<DrawnFrame, PixelImage>>,
  box?: HeadBox, rects: readonly Pick<HeadLayer, "name" | "rect">[] = []): PreparedLook | string {
  const image = art.image, problem = alignmentProblem(rig, neutral, image, art.region);
  if (problem) return problem;
  let layers: CutLayer[];
  try {
    layers = cutHeadLayers(image, rig).filter((layer) => layer.name !== "hand").map((layer) => {
      const rect = rects.find((entry) => entry.name === layer.name)?.rect;
      return rect ? fitLayer(layer, rect) : layer;
    });
  }
  catch (error) { return error instanceof Error ? error.message : "the expression art could not be cut"; }
  const gaze = rig.eyes.map((eye, index) => {
    const ball = layers.find((layer) => layer.name === `eye${index}_ball`);
    return !!ball && !squinted(eye, neutral, image) && holes(ball, eye) === 0;
  });
  const drawn = cutDrawn(rig, image, frames, box);
  return { name, layers, sprites: drawn.sprites, refused: drawn.refused, gaze: [gaze[0] ?? false, gaze[1] ?? false] };
}

const cache = new Map<string, PreparedLook | string>();
const remember = (key: string, value: PreparedLook | string): void => {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > LOOK_CACHE_SIZE) cache.delete(cache.keys().next().value as string);
};
export const clearLookCache = (): void => cache.clear();

export async function prepareLook(rig: Rig, artHash: string, neutral: PixelImage, name: string, source: ExpressionArt, box: HeadBox | undefined,
  run: RunGuard, deps: DrawnDeps, rects: readonly Pick<HeadLayer, "name" | "rect">[] = []): Promise<PreparedLook | string | null> {
  const bytes = await deps.bytes(source.art, run.signal);
  if (!run.stillOwns()) return null;
  const sha = await deps.hash(bytes);
  if (!run.stillOwns()) return null;
  const listed = drawnFrames({ frames: source.frames });
  const key = JSON.stringify([artHash, name, sha, box ?? null, listed, rects.map((entry) => [entry.name, entry.rect])]);
  const known = cache.get(key);
  if (known) { remember(key, known); return known; }
  const decoded = await deps.pixels(bytes, run.signal);
  if (!run.stillOwns()) return null;
  const art = lookArt(rig, decoded, box);
  if (typeof art === "string") { remember(key, art); return art; }
  const frames: Partial<Record<DrawnFrame, PixelImage>> = {};
  for (const [frame, path] of listed) {
    const frameBytes = await deps.bytes(path, run.signal);
    if (!run.stillOwns()) return null;
    frames[frame] = await deps.pixels(frameBytes, run.signal);
    if (!run.stillOwns()) return null;
  }
  const look = cutLook(rig, name, neutral, art, frames, box, rects);
  remember(key, look);
  return look;
}

export interface LookBinding { rig: Rig; artHash: string; art: ArrayBuffer; layers: readonly Pick<HeadLayer, "name" | "rect">[]; surface: LookSurface; run: RunGuard }

export class HeadLooks {
  private wanted: string | null = null;
  private cut = false;
  private binding: LookBinding | null = null;
  private neutral: Promise<PixelImage | null> | null = null;
  private readonly ready = new Set<string>();
  private readonly failed = new Map<string, string>();
  private readonly loading = new Set<string>();
  private readonly names: string[];

  constructor(private readonly sources: ExpressionSources, private readonly deps: DrawnDeps,
    private readonly report?: (name: string, look: PreparedLook | null, problem: string | null) => void) {
    this.names = Object.keys(sources.looks);
  }

  want(label: string, cut: boolean): void {
    this.wanted = expressionTexture(label, this.names);
    this.cut = cut;
  }

  textured(): boolean { return this.wanted !== null && !this.failed.has(this.wanted); }

  bind(binding: LookBinding, schedule: (run: () => void, ms: number) => void = (run, ms) => { setTimeout(run, ms); }): void {
    this.binding = binding;
    const preferred = [...this.names].sort((a, b) => Number(!(a in FAMILIES)) - Number(!(b in FAMILIES))).slice(0, PRELOAD_COUNT);
    preferred.forEach((name, index) => schedule(() => {
      if (binding.run.stillOwns() && !this.ready.has(name) && !this.failed.has(name) && !this.loading.has(name)) void this.load(name, binding);
    }, PRELOAD_MS * (index + 1)));
  }

  frame(): void {
    const binding = this.binding, wanted = this.wanted;
    if (!binding) return;
    if (wanted === null || this.failed.has(wanted)) { binding.surface.showLook(null, this.cut); return; }
    if (this.ready.has(wanted)) { binding.surface.showLook(wanted, this.cut); return; }
    if (!this.loading.has(wanted)) void this.load(wanted, binding);
  }

  private async load(name: string, binding: LookBinding): Promise<void> {
    const { rig, artHash, art, layers, surface, run } = binding;
    this.loading.add(name);
    try {
      this.neutral ??= this.deps.pixels(art, run.signal).then((image) => rigWindow(rig, image, undefined)).then((image) => typeof image === "string" ? null : image);
      const neutral = await this.neutral;
      if (!run.stillOwns()) return;
      if (!neutral) { this.failed.set(name, "the neutral art could not be read"); this.report?.(name, null, this.failed.get(name) ?? null); return; }
      const look = await prepareLook(rig, artHash, neutral, name, this.sources.looks[name], this.sources.box, run, this.deps, layers);
      if (!run.stillOwns() || look === null) return;
      if (typeof look === "string") { this.failed.set(name, look); this.report?.(name, null, look); return; }
      surface.addLook(look);
      this.ready.add(name);
      this.report?.(name, look, null);
    } catch (error) {
      if (!run.stillOwns()) return;
      const problem = error instanceof Error ? error.message : "the expression art could not be loaded";
      this.failed.set(name, problem);
      this.report?.(name, null, problem);
    } finally { this.loading.delete(name); }
  }
}

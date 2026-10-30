import { log } from "@utils/log";
import { blinkGap, blinkTwice } from "./animation";
import { FRAME_KEYS, type AnimationFrames, type MouthFrameKey } from "./frameKeys";
import { MouthStepper, type MouthSample } from "./mouthShape";
import { DEFAULT_MOUTH_CONFIG, type MouthConfig } from "./mouthConfig";

const MB = 1024 * 1024;
export const FRAME_BYTES_PER_ACTOR = 24 * MB;
const MIN_FRAME_BUDGET = 64 * MB;
const MAX_FRAME_BUDGET = 256 * MB;
const BLINK_MS = 140;
const DOUBLE_GAP_MS = 110;
const MOUTH_MS = 110;
const VISEME_TICK_MS = 30;

export const frameBudget = (actors: number): number => Math.min(MAX_FRAME_BUDGET, Math.max(MIN_FRAME_BUDGET, actors * FRAME_BYTES_PER_ACTOR));

export class FrameMemory {
  private held = new Map<string, number>();
  private warned = false;

  constructor(private readonly warn: (message: string) => void = (message) => log.warn(message)) {}

  used(): number {
    return [...this.held.values()].reduce((sum, value) => sum + value, 0);
  }

  reserve(key: string, bytes: number, budget: number): boolean {
    if (this.used() + bytes > budget) {
      if (!this.warned) {
        this.warned = true;
        this.warn(`Sprite animation: a frame was skipped to stay within ${Math.round(budget / MB)} MB of decoded frames; that face does not animate.`);
      }
      return false;
    }
    this.held.set(key, bytes);
    return true;
  }

  release(key: string): void {
    this.held.delete(key);
  }
}

export const frameMemory = new FrameMemory();

export type FrameDecoder = (path: string) => Promise<{ width: number; height: number }>;

export const decodeImage: FrameDecoder = async (path) => {
  const image = new Image();
  image.src = path;
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight };
};

export async function decodeFrames(frames: AnimationFrames, seed: string, budget: number, memory: FrameMemory, decode: FrameDecoder,
  live: () => boolean, held: string[]): Promise<AnimationFrames | null> {
  const loaded: AnimationFrames = {};
  for (const key of FRAME_KEYS) {
    const path = frames[key];
    if (!path) continue;
    try {
      const size = await decode(path);
      if (!live()) return null;
      const allocation = `${seed}:${key}:${path}`;
      if (!memory.reserve(allocation, size.width * size.height * 4, budget)) continue;
      held.push(allocation);
      loaded[key] = path;
    } catch {
      continue;
    }
  }
  return loaded;
}

interface Faded { style: { opacity: string } }

export function startBlink(target: Faded, seed: string): () => void {
  let cycle = 0;
  let timer: ReturnType<typeof setTimeout>;
  const blink = (after: () => void) => {
    target.style.opacity = "1";
    timer = setTimeout(() => { target.style.opacity = "0"; after(); }, BLINK_MS);
  };
  const schedule = () => {
    const current = cycle++;
    timer = setTimeout(() => blink(() => {
      if (blinkTwice(seed, current)) timer = setTimeout(() => blink(schedule), DOUBLE_GAP_MS);
      else schedule();
    }), blinkGap(seed, current));
  };
  schedule();
  return () => { clearTimeout(timer); target.style.opacity = "0"; };
}

export function startMouth(target: Faded & { src: string }, sequence: Array<string | null>): () => void {
  if (sequence.length <= 1) return () => { target.style.opacity = "0"; };
  let index = 0;
  const timer = setInterval(() => {
    const path = sequence[index++ % sequence.length];
    if (path) target.src = path;
    target.style.opacity = path ? "1" : "0";
  }, MOUTH_MS);
  return () => { clearInterval(timer); target.style.opacity = "0"; };
}

export function startVisemeMouth(target: Faded & { src: string }, frames: Pick<AnimationFrames, MouthFrameKey>,
  sample: (now: number) => MouthSample | null | undefined, fallback: Array<string | null>, clock: () => number = () => performance.now(),
  config: MouthConfig = DEFAULT_MOUTH_CONFIG): () => void {
  if (!frames.talk) return () => { target.style.opacity = "0"; };
  const stepper = new MouthStepper(config);
  const began = clock();
  let shown: string | null = null;
  const show = (path: string | null) => {
    if (path === shown) return;
    shown = path;
    if (path) target.src = path;
    target.style.opacity = path ? "1" : "0";
  };
  const timer = setInterval(() => {
    const now = clock(), value = sample(now);
    if (value === undefined) { show(fallback.length > 1 ? fallback[Math.floor((now - began) / MOUTH_MS) % fallback.length] : null); return; }
    const frame = stepper.next(value, frames, now);
    show(frame ? frames[frame] ?? null : null);
  }, VISEME_TICK_MS);
  return () => { clearInterval(timer); target.style.opacity = "0"; };
}

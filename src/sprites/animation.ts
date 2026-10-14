import { fnv1a } from "@runtime/hash";
import { spriteFileName } from "./profile";
import { log } from "@utils/log";
import type { MouthSample } from "./mouthShape";
import { FRAME_KIND_PATTERN, type AnimationFrames, type FrameKey } from "./frameKeys";
import { DEFAULT_MOUTH_CONFIG, type MouthConfig } from "./mouthConfig";
export { FRAME_KEYS, MOUTH_FRAME_KEYS, type AnimationFrames, type FrameKey, type MouthFrameKey } from "./frameKeys";
export type MouthMode = "off" | "simple" | "smooth";
const FRAME_FILE = new RegExp(`^([a-z0-9_]+)\\.(${FRAME_KIND_PATTERN})\\.png$`, "i");

export function frameIndex(files: Array<{ path: string }>): Map<string, AnimationFrames> {
  const result = new Map<string, AnimationFrames>();
  for (const { path } of files) {
    const filename = spriteFileName(path);
    const match = FRAME_FILE.exec(filename);
    if (!match) continue;
    const entry = result.get(match[1]) ?? {};
    entry[match[2].toLowerCase() as FrameKey] = path;
    result.set(match[1], entry);
  }
  return result;
}

export function mouthSequence(mode: MouthMode, frames: AnimationFrames): Array<string | null> {
  if (mode === "off" || !frames.talk) return [null];
  return mode === "smooth" && frames.talk2 ? [null, frames.talk2, frames.talk, frames.talk2, null] : [null, frames.talk];
}

export function blinkGap(seed: string, cycle: number): number {
  return 2500 + Number.parseInt(fnv1a(`${seed}:${cycle}`), 16) % 3501;
}

export interface TextMouthEngine { push(text: string, now: number): void; sample(now: number): MouthSample | null }
export type TextMouthFactory = (spoken: string, config?: MouthConfig) => TextMouthEngine;

export const loadTextMouth = (): Promise<TextMouthFactory> => import("./lipsync/textMouth").then((module) => module.createTextMouth);

export class StreamActivity {
  private speaker: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private factory: TextMouthFactory | null = null;
  private loading: Promise<void> | null = null;
  private engine: TextMouthEngine | null = null;
  private spoken = "";
  constructor(private readonly clock: () => number = () => performance.now(), readonly mouthConfig: MouthConfig = DEFAULT_MOUTH_CONFIG) {}
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  view = (): string | null => this.speaker;
  visemes(load: () => Promise<TextMouthFactory> = loadTextMouth): Promise<void> {
    this.loading ??= load().then((factory) => { this.factory = factory; }, (error: unknown) => { log.warn("Sprite mouth: the text lip-sync chunk did not load; the mouth flaps instead.", error); });
    return this.loading;
  }
  pulse(name: string, text?: string): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.speaker !== name) { this.speaker = name; this.engine = null; this.spoken = ""; this.listeners.forEach((listener) => listener()); }
    if (text !== undefined) {
      if (this.factory) { this.engine ??= this.factory(this.spoken, this.mouthConfig); this.engine.push(text, this.clock()); }
      this.spoken = text;
    }
    this.timer = setTimeout(() => this.stop(), 300);
  }
  mouth(name: string, now: number = this.clock()): MouthSample | null | undefined {
    if (!this.factory) return undefined;
    return this.speaker === name && this.engine ? this.engine.sample(now) : null;
  }
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.engine = null;
    this.spoken = "";
    if (this.speaker !== null) { this.speaker = null; this.listeners.forEach((listener) => listener()); }
  }
}

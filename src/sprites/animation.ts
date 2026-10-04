export interface AnimationFrames { blink?: string; talk?: string; talk2?: string }
import { fnv1a } from "@runtime/hash";
export type MouthMode = "off" | "simple" | "smooth";

export function frameIndex(files: Array<{ path: string }>): Map<string, AnimationFrames> {
  const result = new Map<string, AnimationFrames>();
  for (const { path } of files) {
    const filename = decodeURIComponent(path.split("?")[0].split("/").pop() ?? "");
    const match = /^([a-z0-9_]+)\.(blink|talk2|talk)\.png$/i.exec(filename);
    if (!match) continue;
    const entry = result.get(match[1]) ?? {};
    entry[match[2] as keyof AnimationFrames] = path;
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

export class StreamActivity {
  private speaker: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  view = (): string | null => this.speaker;
  pulse(name: string): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.speaker !== name) { this.speaker = name; this.listeners.forEach((listener) => listener()); }
    this.timer = setTimeout(() => this.stop(), 300);
  }
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.speaker !== null) { this.speaker = null; this.listeners.forEach((listener) => listener()); }
  }
}

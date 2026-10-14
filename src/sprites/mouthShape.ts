/*! Vowel classification with hysteresis adapted from mesh-avatar-studio packages/runtime/src/engine/sprites.js (26243f9).
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
import { MOUTH_FRAME_KEYS, type AnimationFrames, type MouthFrameKey } from "./frameKeys";
import { DEFAULT_MOUTH_CONFIG, type MouthConfig, type MouthShape, type Vowel } from "./mouthConfig";

export type { MouthShape, Vowel } from "./mouthConfig";
export interface MouthSample { open: number; form: number; viseme: string }
export type MouthFrame = MouthFrameKey | null;
export type MouthFrames = Pick<AnimationFrames, MouthFrameKey>;

export function classifyVowel(form: number, previous: MouthShape | string | null, config: MouthConfig = DEFAULT_MOUTH_CONFIG): Vowel {
  const regions = config.regions, pad = previous ? config.vowelPad : 0;
  const was = previous ? regions.find(([vowel]) => vowel === previous || (previous === "aHalf" && vowel === "a")) : undefined;
  if (was && form >= was[1] - pad && form < was[2] + pad) return was[0];
  return (regions.find(([, low, high]) => form >= low && form < high) ?? regions.find(([vowel]) => vowel === "a") ?? regions[0])[0];
}

export function mouthShape(open: number, form: number, previous: MouthShape | null, config: MouthConfig = DEFAULT_MOUTH_CONFIG): MouthShape | null {
  if (open < (previous ? config.openMin - config.openPad : config.openMin)) return null;
  const vowel = classifyVowel(form, previous, config);
  if (vowel !== "a") return vowel;
  const wide = previous === "a" ? open >= config.wideOpen - config.widePad : open >= config.wideOpen;
  return wide ? "a" : "aHalf";
}

export function shapeFrame(shape: MouthShape | null, frames: MouthFrames, config: MouthConfig = DEFAULT_MOUTH_CONFIG): MouthFrame {
  if (!shape) return null;
  return config.chains[shape].find((key) => frames[key]) ?? null;
}

export const onlyTalk = (frames: MouthFrames): boolean => Boolean(frames.talk) && MOUTH_FRAME_KEYS.every((key) => key === "talk" || !frames[key]);

export class MouthStepper {
  private shape: MouthShape | null = null;
  private frame: MouthFrame = null;
  private since = -Infinity;

  constructor(private readonly config: MouthConfig = DEFAULT_MOUTH_CONFIG, private readonly holdMs = config.holdMs) {}

  next(sample: MouthSample | null, frames: MouthFrames, now: number): MouthFrame {
    const config = this.config;
    this.shape = sample ? mouthShape(sample.open, sample.form, this.shape, config) : null;
    const twoFrame = onlyTalk(frames);
    const open = sample?.open ?? 0;
    const wanted = twoFrame && this.shape
      ? (open >= (this.frame ? config.twoFrameClose : config.twoFrameOpen) ? "talk" : null)
      : shapeFrame(this.shape, frames, config);
    if (wanted !== this.frame && now - this.since >= this.holdMs) { this.frame = wanted; this.since = now; }
    return this.frame;
  }

  reset(): void { this.shape = null; this.frame = null; this.since = -Infinity; }
}

export const blendForm = (current: number, sample: number, config: MouthConfig = DEFAULT_MOUTH_CONFIG): number =>
  Math.max(-1, Math.min(1, current * (1 - config.visemeFormShare) + sample * config.visemeFormShare));

export function withVisemeMouth<T extends { mouthOpen: number; mouthForm: number }>(parameters: T, sample: MouthSample | null | undefined, config: MouthConfig = DEFAULT_MOUTH_CONFIG): T {
  if (sample === undefined) return parameters;
  if (!sample) return { ...parameters, mouthOpen: 0 };
  return { ...parameters, mouthOpen: sample.open, mouthForm: blendForm(parameters.mouthForm, sample.form, config) };
}

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
import type { AnimationFrames } from "./animation";

export interface MouthSample { open: number; form: number; viseme: string }
export type Vowel = "i" | "e" | "a" | "o" | "u";
export type MouthShape = Vowel | "aHalf";
export type MouthFrame = "talk" | "talk2" | null;

const VOWEL_PAD = 0.07;
const OPEN_MIN = 0.16;
const OPEN_PAD = 0.04;
const WIDE_OPEN = 0.6;
const WIDE_PAD = 0.05;
const TWO_FRAME_OPEN = 0.45;
const TWO_FRAME_CLOSE = 0.35;
const REGIONS: Array<[Vowel, number, number]> = [["i", -9, -0.55], ["e", -0.55, -0.2], ["a", -0.2, 0.35], ["o", 0.35, 0.75], ["u", 0.75, 9]];

export function classifyVowel(form: number, previous: MouthShape | null): Vowel {
  const pad = previous ? VOWEL_PAD : 0;
  const was = previous ? REGIONS.find(([vowel]) => vowel === previous || (previous === "aHalf" && vowel === "a")) : undefined;
  if (was && form >= was[1] - pad && form < was[2] + pad) return was[0];
  return (REGIONS.find(([, low, high]) => form >= low && form < high) ?? REGIONS[2])[0];
}

export function mouthShape(open: number, form: number, previous: MouthShape | null): MouthShape | null {
  if (open < (previous ? OPEN_MIN - OPEN_PAD : OPEN_MIN)) return null;
  const vowel = classifyVowel(form, previous);
  if (vowel !== "a") return vowel;
  const wide = previous === "a" ? open >= WIDE_OPEN - WIDE_PAD : open >= WIDE_OPEN;
  return wide ? "a" : "aHalf";
}

export function shapeFrame(shape: MouthShape | null, frames: Pick<AnimationFrames, "talk" | "talk2">): MouthFrame {
  if (!shape || !frames.talk) return null;
  return frames.talk2 && (shape === "aHalf" || shape === "e" || shape === "i" || shape === "u") ? "talk2" : "talk";
}

export class MouthStepper {
  private shape: MouthShape | null = null;
  private frame: MouthFrame = null;
  private since = -Infinity;

  constructor(private readonly holdMs = 60) {}

  next(sample: MouthSample | null, frames: Pick<AnimationFrames, "talk" | "talk2">, now: number): MouthFrame {
    this.shape = sample ? mouthShape(sample.open, sample.form, this.shape) : null;
    const twoFrame = Boolean(frames.talk) && !frames.talk2;
    const open = sample?.open ?? 0;
    const wanted = twoFrame && this.shape
      ? (open >= (this.frame ? TWO_FRAME_CLOSE : TWO_FRAME_OPEN) ? "talk" : null)
      : shapeFrame(this.shape, frames);
    if (wanted !== this.frame && now - this.since >= this.holdMs) { this.frame = wanted; this.since = now; }
    return this.frame;
  }

  reset(): void { this.shape = null; this.frame = null; this.since = -Infinity; }
}

export function withVisemeMouth<T extends { mouthOpen: number; mouthForm: number }>(parameters: T, sample: MouthSample | null | undefined): T {
  if (sample === undefined) return parameters;
  if (!sample) return { ...parameters, mouthOpen: 0 };
  return { ...parameters, mouthOpen: sample.open, mouthForm: Math.max(-1, Math.min(1, parameters.mouthForm * 0.4 + sample.form * 0.6)) };
}

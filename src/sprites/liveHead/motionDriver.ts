/*! Adapted from mesh-avatar-studio 6f6d362.
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
import { fnv1a } from "@runtime/hash";
import type { HeadParameters } from "./drivers";
import { IDLE_MOTIONS, REACTION_MOTIONS, type MotionDef, type MotionTrack } from "./motionTracks";

export type Presence = "talking" | "listening" | "idle";
type Key = keyof HeadParameters;
type Kind = "add" | "face" | "eye" | "breath" | "max";
type Write = (p: HeadParameters, value: number, weight: number) => void;
interface Track { key: Key; keys: MotionTrack; kind: Kind; write: Write }
export interface Motion { id: string; dur: number; tracks: Track[] }

const ADDITIVE = new Set<string>(["angleX", "angleY", "angleZ", "bodyAngleX", "bodyAngleZ", "armAngle", "handAngle", "gazeX", "gazeY"]);
const FACE = new Set<string>(["eyeSmile", "mouthForm", "blush", "browY", "browAngle"]);

export const MOTION_TUNE = { head: 0.8, breath: 0.4, eyeFloor: 0.5, talk: 0.7, listenBias: 1.5, listenGain: 0.5,
  idleSlotMs: 12_000, idleChance: 0.6, listenSlotMs: 5_000, listenChance: 0.3, ease: 0.15, release: 0.25 };

const ADDERS: Partial<Record<Key, Write>> = {
  angleX: (p, v) => { p.angleX += v * MOTION_TUNE.head; }, angleY: (p, v) => { p.angleY += v * MOTION_TUNE.head; }, angleZ: (p, v) => { p.angleZ += v * MOTION_TUNE.head; },
  bodyAngleX: (p, v) => { p.bodyAngleX += v; }, bodyAngleZ: (p, v) => { p.bodyAngleZ += v; }, armAngle: (p, v) => { p.armAngle += v; },
  handAngle: (p, v) => { p.handAngle += v; }, gazeX: (p, v) => { p.gazeX += v; }, gazeY: (p, v) => { p.gazeY += v; },
};
const MIXERS: Partial<Record<Key, Write>> = {
  eyeSmile: (p, v, w) => { p.eyeSmile += (v - p.eyeSmile) * w; }, mouthForm: (p, v, w) => { p.mouthForm += (v - p.mouthForm) * w; },
  blush: (p, v, w) => { p.blush += (v - p.blush) * w; }, browY: (p, v, w) => { p.browY += (v - p.browY) * w; }, browAngle: (p, v, w) => { p.browAngle += (v - p.browAngle) * w; },
};
const writeEye: Write = (p, v, w) => { p.eyeOpen *= 1 + (Math.min(1.25, Math.max(MOTION_TUNE.eyeFloor, v)) - 1) * w; };
const writeBreath: Write = (p, v, w) => { p.breath += (v * MOTION_TUNE.breath - p.breath) * w; };
const writeTap: Write = (p, v, w) => { p.fingerTap = Math.max(p.fingerTap, v * w); };
const skip: Write = () => undefined;
function writer(key: Key, kind: Kind): Write {
  if (kind === "add") return ADDERS[key] ?? skip;
  if (kind === "face") return MIXERS[key] ?? skip;
  return kind === "eye" ? writeEye : kind === "breath" ? writeBreath : writeTap;
}

function compile(id: string, def: MotionDef): Motion {
  const tracks: Track[] = [];
  for (const [key, keys] of Object.entries(def.tracks)) {
    const kind: Kind | null = ADDITIVE.has(key) ? "add" : FACE.has(key) ? "face" : key === "eyeOpen" ? "eye" : key === "breath" ? "breath" : key === "fingerTap" ? "max" : null;
    if (kind !== null) tracks.push({ key: key as Key, keys, kind, write: writer(key as Key, kind) });
  }
  return { id, dur: def.dur, tracks };
}
const compileAll = (set: Readonly<Record<string, MotionDef>>): Motion[] => Object.entries(set).map(([id, def]) => compile(id, def));
export const REACTIONS = compileAll(REACTION_MOTIONS);
export const IDLES = compileAll(IDLE_MOTIONS);
const byId = new Map([...REACTIONS, ...IDLES].map((motion) => [motion.id, motion]));
export const motionById = (id: string): Motion | undefined => byId.get(id);

const LABEL_REACTION: Readonly<Record<string, string>> = {
  joy: "nod", happy: "nod", love: "nod", approval: "nod", admiration: "nod", gratitude: "nod", caring: "nod",
  amusement: "giggle", surprise: "surprise", surprised: "surprise", fear: "surprise", realization: "surprise", excitement: "surprise",
  sad: "sigh", sadness: "sigh", grief: "sigh", remorse: "sigh", disappointment: "sigh",
  anger: "no", angry: "no", annoyance: "no", disgust: "no", disapproval: "no",
  embarrassment: "shy", nervousness: "shy", curiosity: "tilt", confusion: "tilt", thinking: "think", desire: "shy",
};
export const reactionFor = (label: string): string | undefined => LABEL_REACTION[label.toLowerCase()];

const tangent = (keys: MotionTrack, j: number, n: number): number => j <= 0 || j >= n ? 0 : (keys[j + 1][1] - keys[j - 1][1]) / (keys[j + 1][0] - keys[j - 1][0]);

export function sampleTrack(keys: MotionTrack, t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length - 1;
  if (t >= keys[n][0]) return keys[n][1];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const t0 = keys[i][0], v0 = keys[i][1], t1 = keys[i + 1][0], v1 = keys[i + 1][1];
  const h = t1 - t0, u = (t - t0) / h, m0 = tangent(keys, i, n) * h, m1 = tangent(keys, i + 1, n) * h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lattice = (n: number, seed: number): number => { const x = Math.sin((n + seed * 57.3) * 127.1) * 43758.5453; return x - Math.floor(x); };
function noise(t: number, seed: number): number {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return (lattice(i, seed) * (1 - u) + lattice(i + 1, seed) * u) * 2 - 1;
}
const fbm = (t: number, seed: number): number => noise(t, seed) * 0.7 + noise(t * 2.3, seed + 9) * 0.3;

export interface Scheduled { motion: Motion; startMs: number; gain: number; headOnly: boolean; slot: string }

export const motionSlot = (presence: Presence, elapsedMs: number): number =>
  Math.floor(elapsedMs / (presence === "idle" ? MOTION_TUNE.idleSlotMs : MOTION_TUNE.listenSlotMs));

export function scheduledMotion(seed: string, presence: Presence, elapsedMs: number): Scheduled | null {
  if (presence === "talking" || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const idle = presence === "idle", slotMs = idle ? MOTION_TUNE.idleSlotMs : MOTION_TUNE.listenSlotMs;
  const slot = motionSlot(presence, elapsedMs), hash = Number.parseInt(fnv1a(`${seed}:${presence}:${slot}`), 16);
  if ((hash & 0xffff) / 0x10000 >= (idle ? MOTION_TUNE.idleChance : MOTION_TUNE.listenChance)) return null;
  const motion = idle ? IDLES[(hash >>> 16) % IDLES.length] : byId.get("nod");
  if (!motion) return null;
  const room = Math.max(0, slotMs - motion.dur * 1000 - 1000), startMs = slot * slotMs + 500 + ((hash >>> 8) & 0xff) / 0xff * room;
  return { motion, startMs, gain: idle ? 1 : MOTION_TUNE.listenGain, headOnly: !idle, slot: `${presence}:${slot}` };
}

export class MotionDriver {
  private readonly noiseSeed: number;
  private label: string | null = null;
  private play: Motion | null = null;
  private playStart = 0;
  private playGain = 1;
  private headOnly = false;
  private lastSlot = "";
  private cachedPresence: Presence | null = null;
  private cachedSlot = -1;
  private cached: Scheduled | null = null;
  private talkNod = 0;
  private lastMs = Number.NaN;
  playing: string | null = null;

  constructor(private readonly seed: string) {
    this.noiseSeed = Number.parseInt(fnv1a(`${seed}:motion`), 16) % 997;
  }

  start(id: string, elapsedMs: number, gain = 1, headOnly = false): boolean {
    const motion = byId.get(id);
    if (!motion) return false;
    this.play = motion; this.playStart = elapsedMs; this.playGain = gain; this.headOnly = headOnly; this.playing = id;
    return true;
  }

  apply(p: HeadParameters, elapsedMs: number, label: string, presence: Presence, motion: boolean): HeadParameters {
    const previous = this.label;
    this.label = label;
    if (!motion || !Number.isFinite(elapsedMs)) {
      this.play = null; this.playing = null; this.talkNod = 0; this.lastMs = Number.NaN;
      return p;
    }
    const dt = Number.isFinite(this.lastMs) ? Math.min(0.1, Math.max(0, (elapsedMs - this.lastMs) / 1000)) : 0;
    this.lastMs = elapsedMs;
    const t = elapsedMs / 1000, s = this.noiseSeed;
    p.hair = 1;
    p.bodyAngleX += fbm(t * 0.1, s + 4) * 3; p.bodyAngleZ += fbm(t * 0.09, s + 5) * 2.5;
    p.armAngle += fbm(t * 0.14, s + 6) * 3; p.handAngle += fbm(t * 0.21, s + 7) * 3;
    if (previous !== null && previous !== label && presence !== "talking") {
      const reaction = reactionFor(label);
      if (reaction) this.start(reaction, elapsedMs);
    }
    const talk = presence === "talking" ? MOTION_TUNE.talk : 0;
    this.talkNod += (p.mouthOpen * 7 * talk - this.talkNod) * Math.min(1, dt * 6);
    p.angleY -= this.talkNod;
    if (talk) { p.angleX += fbm(t * 0.6, s + 11) * 5 * talk; p.angleZ += fbm(t * 0.5, s + 12) * 4 * talk; }
    if (presence === "listening") p.angleY += MOTION_TUNE.listenBias;
    if (this.play && elapsedMs - this.playStart >= this.play.dur * 1000) { this.play = null; this.playing = null; }
    if (!this.play) {
      const next = this.scheduled(presence, elapsedMs);
      if (next && next.slot !== this.lastSlot && elapsedMs >= next.startMs && elapsedMs < next.startMs + next.motion.dur * 1000) {
        this.lastSlot = next.slot;
        this.play = next.motion; this.playStart = next.startMs; this.playGain = next.gain; this.headOnly = next.headOnly; this.playing = next.motion.id;
      }
    }
    if (this.play) this.mix(p, (elapsedMs - this.playStart) / 1000, presence === "talking");
    return p;
  }

  private scheduled(presence: Presence, elapsedMs: number): Scheduled | null {
    if (presence === "talking") return null;
    const slot = motionSlot(presence, elapsedMs);
    if (presence !== this.cachedPresence || slot !== this.cachedSlot) {
      this.cachedPresence = presence; this.cachedSlot = slot; this.cached = scheduledMotion(this.seed, presence, elapsedMs);
    }
    return this.cached;
  }

  private mix(p: HeadParameters, at: number, talking: boolean): void {
    const motion = this.play;
    if (!motion) return;
    const weight = smooth(0, MOTION_TUNE.ease, at) * (1 - smooth(motion.dur - MOTION_TUNE.release, motion.dur, at)), gain = this.playGain;
    for (let i = 0; i < motion.tracks.length; i++) {
      const track = motion.tracks[i], key = track.key;
      if (this.headOnly && track.kind !== "add") continue;
      if (talking && key === "mouthForm") continue;
      const value = sampleTrack(track.keys, at);
      if (track.kind === "add") track.write(p, value * weight * gain, 1);
      else track.write(p, value, weight);
    }
  }
}

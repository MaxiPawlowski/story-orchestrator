import { fnv1a } from "@runtime/hash";

export interface SpriteMotion { id: string; ms: number; frames: Keyframe[] }

const t = (transform: string, offset?: number): Keyframe => (offset === undefined ? { transform } : { transform, offset });
const REST = "none";

export const SPRITE_REACTIONS: Readonly<Record<string, SpriteMotion>> = {
  nod: { id: "nod", ms: 700, frames: [t(REST), t("translateY(1.2%)", 0.25), t(REST, 0.5), t("translateY(1%)", 0.75), t(REST)] },
  giggle: { id: "giggle", ms: 650, frames: [t(REST), t("translateY(-1%)", 0.17), t(REST, 0.33), t("translateY(-1%)", 0.5), t(REST, 0.67), t("translateY(-0.8%)", 0.83), t(REST)] },
  surprise: { id: "surprise", ms: 480, frames: [t(REST), t("translateY(-3%) scale(1.03)", 0.35), t(REST)] },
  sigh: { id: "sigh", ms: 1300, frames: [t(REST), t("translateY(1.5%) scaleY(0.985)", 0.45), t(REST)] },
  no: { id: "no", ms: 520, frames: [t(REST), t("translateX(-1.4%)", 0.2), t("translateX(1.4%)", 0.45), t("translateX(-1%)", 0.7), t(REST)] },
  shy: { id: "shy", ms: 950, frames: [t(REST), t("scale(0.98) rotate(-1deg)", 0.4), t(REST)] },
  tilt: { id: "tilt", ms: 850, frames: [t(REST), t("rotate(1.5deg)", 0.4), t(REST)] },
  think: { id: "think", ms: 1100, frames: [t(REST), t("rotate(-1deg) translateY(0.5%)", 0.45), t(REST)] },
};

export const SPRITE_HOP: SpriteMotion = { id: "hop", ms: 400, frames: [t(REST), t("translateY(-2.5%)", 0.45), t(REST)] };

export const SPRITE_IDLES: readonly SpriteMotion[] = [
  { id: "glance", ms: 1500, frames: [t(REST), t("rotate(0.8deg)", 0.4), t(REST)] },
  { id: "lean", ms: 1700, frames: [t(REST), t("translateX(0.8%)", 0.45), t(REST)] },
  { id: "rest", ms: 1400, frames: [t(REST), t("translateY(1%) scaleY(0.99)", 0.5), t(REST)] },
  { id: "stretch", ms: 1300, frames: [t(REST), t("scaleY(1.012)", 0.5), t(REST)] },
];

export const SPRITE_PUNCH: Keyframe[] = [
  { transform: REST }, { transform: "translate(-0.6%, 0.4%)", offset: 0.15 }, { transform: "translate(0.6%, -0.3%)", offset: 0.35 },
  { transform: "translate(-0.4%, 0.2%)", offset: 0.55 }, { transform: "translate(0.2%, 0)", offset: 0.75 }, { transform: REST },
];
export const PUNCH_MS = 420;

export const IDLE_SLOT_MS = 9000;
const IDLE_CHANCE = 0.35;

export interface IdleBeat { motion: SpriteMotion; startMs: number; slot: number }

export function idleBeat(seed: string, slot: number): IdleBeat | null {
  if (!Number.isInteger(slot) || slot < 0) return null;
  const hash = Number.parseInt(fnv1a(`${seed}:idle:${slot}`), 16);
  if ((hash & 0xffff) / 0x10000 >= IDLE_CHANCE) return null;
  const motion = SPRITE_IDLES[(hash >>> 16) % SPRITE_IDLES.length];
  const room = Math.max(0, IDLE_SLOT_MS - motion.ms - 1000);
  return { motion, startMs: slot * IDLE_SLOT_MS + 500 + Math.round((((hash >>> 8) & 0xff) / 0xff) * room), slot };
}

export class MotionGate {
  private last = new Map<string, number>();
  allow(key: string, now: number, gapMs: number): boolean {
    const before = this.last.get(key);
    if (before !== undefined && now - before < gapMs) return false;
    this.last.set(key, now);
    return true;
  }
  once(key: string): boolean {
    if (this.last.has(key)) return false;
    this.last.set(key, 0);
    if (this.last.size > 512) this.last.delete(this.last.keys().next().value as string);
    return true;
  }
}

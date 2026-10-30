import type { EffectsLevel } from "../settings";

export type MotionMode = "full" | "calm" | "reduced" | "off";

export interface MotionSwitches {
  effects: EffectsLevel;
  hostReduced: boolean;
  osReduced: boolean;
  storyMotion: boolean;
}

export interface MotionBudget {
  mode: MotionMode;
  enter: "rise" | "fade" | "none";
  enterMs: number;
  exitMs: number;
  moveMs: number;
  reactions: boolean;
  hop: boolean;
  blurOthers: boolean;
  idle: boolean;
  vignette: boolean;
  punch: "shake" | "flash" | "none";
  chapterCard: boolean;
  transitions: "authored" | "opacity" | "none";
  maxTransitionMs: number;
}

export const REDUCED_MS = 150;
export const MAX_TRANSITION_MS = 5000;

const NONE: MotionBudget = {
  mode: "off", enter: "none", enterMs: 0, exitMs: 0, moveMs: 0, reactions: false, hop: false, blurOthers: false, idle: false,
  vignette: false, punch: "none", chapterCard: false, transitions: "none", maxTransitionMs: 0,
};

const REDUCED: MotionBudget = {
  ...NONE, mode: "reduced", enter: "fade", enterMs: REDUCED_MS, exitMs: REDUCED_MS, vignette: true, punch: "flash", chapterCard: true,
  transitions: "opacity", maxTransitionMs: REDUCED_MS,
};

const CALM: MotionBudget = {
  ...NONE, mode: "calm", enter: "fade", enterMs: 450, exitMs: 350, moveMs: 500, vignette: true, punch: "flash", chapterCard: true,
  transitions: "authored", maxTransitionMs: MAX_TRANSITION_MS,
};

const FULL: MotionBudget = {
  ...CALM, mode: "full", enter: "rise", reactions: true, hop: true, blurOthers: true, idle: true, punch: "shake",
};

export function stageMotion(switches: MotionSwitches): MotionBudget {
  if (switches.effects === "off") return NONE;
  if (switches.hostReduced || switches.osReduced || !switches.storyMotion) return REDUCED;
  return switches.effects === "calm" ? CALM : FULL;
}

export const osReducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

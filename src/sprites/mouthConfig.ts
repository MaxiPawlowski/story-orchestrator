import type { MouthFrameKey } from "./frameKeys";

export type Vowel = "i" | "e" | "a" | "o" | "u";
export type MouthShape = Vowel | "aHalf";
export type MouthTiming = "word" | "syllable" | "character";
export type MouthStyle = "auto" | "mesh" | "drawn" | "hybrid";
export interface MouthTarget { open: number; form: number }

export interface MeshMouthConfig {
  openGain: number;
  openMax: number;
  formGain: number;
  formMax: number;
  attackMs: number;
  releaseMs: number;
  settle: number;
}

export interface MouthConfig {
  openMin: number;
  openPad: number;
  vowelPad: number;
  wideOpen: number;
  widePad: number;
  regions: ReadonlyArray<readonly [Vowel, number, number]>;
  chains: Readonly<Record<MouthShape, readonly MouthFrameKey[]>>;
  twoFrameOpen: number;
  twoFrameClose: number;
  holdMs: number;
  visemeFormShare: number;
  visemes: Readonly<Record<string, MouthTarget>>;
  unknownViseme: MouthTarget;
  timing: MouthTiming;
  style: MouthStyle;
  mesh: MeshMouthConfig;
  hybrid: MeshMouthConfig;
  drawn: {
    fade: number;
    crossfadeMs: number;
    holdMs: number;
    refs: Readonly<Record<MouthFrameKey, number>>;
    halfRefForE: number;
    widths: Readonly<Partial<Record<Vowel, number>>>;
    squashMin: number;
    squashMax: number;
  };
}

export const DEFAULT_MOUTH_CONFIG: MouthConfig = {
  openMin: 0.16,
  openPad: 0.04,
  vowelPad: 0.07,
  wideOpen: 0.6,
  widePad: 0.05,
  regions: [["i", -9, -0.55], ["e", -0.55, -0.2], ["a", -0.2, 0.35], ["o", 0.35, 0.75], ["u", 0.75, 9]],
  chains: {
    a: ["talk", "talk2", "mouth_o", "mouth_wide"],
    aHalf: ["talk2", "talk", "mouth_wide", "mouth_o"],
    e: ["talk2", "mouth_wide", "talk", "mouth_o"],
    i: ["mouth_wide", "talk2", "talk", "mouth_o"],
    o: ["mouth_o", "talk", "talk2", "mouth_wide"],
    u: ["mouth_o", "talk2", "talk", "mouth_wide"],
  },
  twoFrameOpen: 0.45,
  twoFrameClose: 0.35,
  holdMs: 60,
  visemeFormShare: 0.6,
  visemes: {
    sil: { open: 0, form: 0 }, PP: { open: 0, form: 0 }, FF: { open: 0.15, form: -0.3 }, TH: { open: 0.25, form: -0.2 },
    DD: { open: 0.3, form: -0.3 }, kk: { open: 0.35, form: -0.1 }, CH: { open: 0.3, form: 0.3 }, SS: { open: 0.15, form: -0.6 },
    nn: { open: 0.2, form: -0.2 }, RR: { open: 0.3, form: 0.4 }, aa: { open: 0.9, form: 0 }, E: { open: 0.62, form: -0.4 },
    EE: { open: 0.62, form: -0.4 }, I: { open: 0.5, form: -0.85 }, O: { open: 0.75, form: 0.6 }, U: { open: 0.4, form: 0.9 },
  },
  unknownViseme: { open: 0.3, form: 0 },
  timing: "word",
  style: "auto",
  mesh: { openGain: 0.18, openMax: 0.15, formGain: 0.2, formMax: 0.12, attackMs: 35, releaseMs: 50, settle: 0.002 },
  hybrid: { openGain: 0.08, openMax: 0.06, formGain: 0, formMax: 0, attackMs: 35, releaseMs: 50, settle: 0.002 },
  drawn: {
    fade: 0.04,
    crossfadeMs: 0,
    holdMs: 0,
    refs: { talk: 0.9, talk2: 0.55, mouth_o: 0.75, mouth_wide: 0.55 },
    halfRefForE: 0.65,
    widths: { e: 1.06, u: 0.78 },
    squashMin: 0.5,
    squashMax: 1.1,
  },
};

export function mouthConfig(patch: Partial<Omit<MouthConfig, "mesh" | "hybrid" | "drawn">> & {
  mesh?: Partial<MeshMouthConfig>; hybrid?: Partial<MeshMouthConfig>; drawn?: Partial<MouthConfig["drawn"]>;
} = {}, base: MouthConfig = DEFAULT_MOUTH_CONFIG): MouthConfig {
  return { ...base, ...patch, mesh: { ...base.mesh, ...patch.mesh }, hybrid: { ...base.hybrid, ...patch.hybrid }, drawn: { ...base.drawn, ...patch.drawn } };
}

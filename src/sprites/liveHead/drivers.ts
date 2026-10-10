import { fnv1a } from "@runtime/hash";
import { blinkGap } from "../animation";

export interface HeadParameters {
  breath: number; angleX: number; angleY: number; angleZ: number;
  gazeX: number; gazeY: number; eyeOpen: number; eyeSmile: number;
  mouthOpen: number; mouthForm: number; browY: number; browAngle: number; blush: number;
}

export const restHead = (): HeadParameters => ({ breath: 0, angleX: 0, angleY: 0, angleZ: 0,
  gazeX: 0, gazeY: 0, eyeOpen: 1, eyeSmile: 0, mouthOpen: 0, mouthForm: 0, browY: 0, browAngle: 0, blush: 0 });

export function expressionHead(label: string): Partial<HeadParameters> {
  switch (label.toLowerCase()) {
    case "joy": case "happy": case "amusement": case "love": return { eyeSmile: 0.7, mouthForm: -0.4, blush: 0.2 };
    case "anger": case "angry": case "annoyance": case "disgust": return { browY: -0.6, browAngle: 0.7, mouthForm: -0.5 };
    case "sad": case "sadness": case "grief": case "remorse": return { browY: -0.3, browAngle: -0.6, eyeOpen: 0.8 };
    case "surprise": case "surprised": case "fear": case "realization": return { eyeOpen: 1.07, browY: 0.8, mouthForm: 0.6 };
    case "embarrassment": case "admiration": return { blush: 0.65, eyeSmile: 0.25 };
    case "sleepy": case "relief": return { eyeOpen: 0.7, browY: -0.2 };
    default: return {};
  }
}

export function idleHead(seed: string, elapsedMs: number): Partial<HeadParameters> {
  const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const phase = Number.parseInt(fnv1a(seed), 16) / 0xffffffff * Math.PI * 2;
  const cycle = Math.floor(time / 8000), gap = blinkGap(seed, cycle);
  const blinkAt = time % 8000 - gap;
  const eyeOpen = blinkAt >= 0 && blinkAt < 160 ? Math.abs(blinkAt - 80) / 80 : 1;
  const seconds = time / 1000;
  return { breath: (1 + Math.sin(seconds * Math.PI / 2 + phase)) * 0.2,
    angleX: Math.sin(seconds * 0.43 + phase) * 2, angleY: Math.sin(seconds * 0.31 + phase) * 1.2,
    angleZ: Math.sin(seconds * 0.27 + phase) * 2, gazeX: Math.sin(seconds * 0.37 + phase) * 0.15,
    gazeY: Math.sin(seconds * 0.23 + phase) * 0.1, eyeOpen };
}

export const mouthHead = (elapsedMs: number, streaming: boolean): number =>
  streaming && Number.isFinite(elapsedMs) ? 0.12 + 0.45 * (1 + Math.sin(elapsedMs / 65)) / 2 : 0;

export function driveHead(seed: string, elapsedMs: number, label: string, streaming: boolean, motion: boolean,
  options: { breathing?: boolean; blink?: boolean; mouth?: boolean } = {}): HeadParameters {
  const expression = expressionHead(label), idle = motion ? idleHead(seed, elapsedMs) : {};
  const result = { ...restHead(), ...idle, ...expression };
  result.eyeOpen = (expression.eyeOpen ?? 1) * (motion && options.blink !== false ? idle.eyeOpen ?? 1 : 1);
  if (options.breathing === false) result.breath = 0;
  result.mouthOpen = mouthHead(elapsedMs, motion && options.mouth !== false && streaming);
  return result;
}

import { fnv1a } from "@runtime/hash";
import { blinkGap } from "../animation";
import { blendForm, type MouthSample } from "../mouthShape";
import { DEFAULT_MOUTH_CONFIG, type MouthConfig } from "../mouthConfig";
import { expressionHead, mouthHead, restHead, type HeadParameters } from "./drivers";

const CYCLE_MS = 8000;

export class HeadDriver {
  readonly parameters: HeadParameters = restHead();
  private readonly phase: number;
  private cycle = -1;
  private gap = 0;
  private label: string | null = null;
  private textured = false;
  private expression: Partial<HeadParameters> = {};

  constructor(private readonly seed: string) {
    this.phase = Number.parseInt(fnv1a(seed), 16) / 0xffffffff * Math.PI * 2;
  }

  drive(elapsedMs: number, label: string, streaming: boolean, motion: boolean, breathing = true, blink = true, mouth = true, textured = false): HeadParameters {
    const out = this.parameters;
    if (label !== this.label || textured !== this.textured) { this.label = label; this.textured = textured; this.expression = textured ? {} : expressionHead(label); }
    const expression = this.expression;
    out.breath = 0; out.angleX = 0; out.angleY = 0; out.angleZ = 0; out.gazeX = 0; out.gazeY = 0;
    out.eyeOpen = 1; out.eyeSmile = 0; out.mouthOpen = 0; out.mouthForm = 0; out.browY = 0; out.browAngle = 0; out.blush = 0;
    out.bodyAngleX = 0; out.bodyAngleZ = 0; out.armAngle = 0; out.handAngle = 0; out.fingerTap = 0; out.hair = 0;
    let idleOpen = 1;
    if (motion) {
      const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0), phase = this.phase;
      const cycle = Math.floor(time / CYCLE_MS);
      if (cycle !== this.cycle) { this.cycle = cycle; this.gap = blinkGap(this.seed, cycle); }
      const blinkAt = time % CYCLE_MS - this.gap;
      idleOpen = blinkAt >= 0 && blinkAt < 160 ? Math.abs(blinkAt - 80) / 80 : 1;
      const seconds = time / 1000;
      out.breath = (1 + Math.sin(seconds * Math.PI / 2 + phase)) * 0.2;
      out.angleX = Math.sin(seconds * 0.43 + phase) * 2; out.angleY = Math.sin(seconds * 0.31 + phase) * 1.2;
      out.angleZ = Math.sin(seconds * 0.27 + phase) * 2; out.gazeX = Math.sin(seconds * 0.37 + phase) * 0.15;
      out.gazeY = Math.sin(seconds * 0.23 + phase) * 0.1; out.eyeOpen = idleOpen;
    }
    Object.assign(out, expression);
    out.eyeOpen = (expression.eyeOpen ?? 1) * (motion && blink ? idleOpen : 1);
    if (!breathing) out.breath = 0;
    out.mouthOpen = mouthHead(elapsedMs, motion && mouth && streaming);
    return out;
  }
}

export function visemeMouth(p: HeadParameters, sample: MouthSample | null | undefined, config: MouthConfig = DEFAULT_MOUTH_CONFIG): HeadParameters {
  if (sample === undefined) return p;
  if (!sample) { p.mouthOpen = 0; return p; }
  p.mouthOpen = sample.open; p.mouthForm = blendForm(p.mouthForm, sample.form, config);
  return p;
}

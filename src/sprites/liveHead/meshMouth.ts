import type { HeadParameters } from "./drivers";
import type { Rig } from "./types";
import { DEFAULT_MOUTH_CONFIG, type MeshMouthConfig, type MouthConfig } from "../mouthConfig";

export const MESH_MOUTH_CAP = DEFAULT_MOUTH_CONFIG.mesh;
export const MOUTH_REGION_MIN_WIDTH = 2;
export type MeshMouthMode = "full" | "capped" | "hybrid" | "still";

export function mouthRegionProblem(rig: Rig): string | null {
  const mouth = rig.mouth, area = mouth.area, head = rig.head;
  if (![mouth.cx, mouth.cy, mouth.angle, mouth.halfLen, area.cx, area.cy, area.rx, area.ry, area.angle, head.cx, head.cy, head.rx, head.ry].every(Number.isFinite))
    return "The rig's mouth landmarks are not numbers.";
  if (mouth.halfLen * 2 < MOUTH_REGION_MIN_WIDTH || area.rx * 2 < MOUTH_REGION_MIN_WIDTH || area.ry <= 0 || head.rx <= 0 || head.ry <= 0)
    return "The rig's mouth region has no width.";
  const inside = (x: number, y: number) => ((x - head.cx) / head.rx) ** 2 + ((y - head.cy) / head.ry) ** 2 <= 1;
  const dx = Math.cos(mouth.angle) * mouth.halfLen, dy = Math.sin(mouth.angle) * mouth.halfLen;
  if (!inside(mouth.cx - dx, mouth.cy - dy) || !inside(mouth.cx + dx, mouth.cy + dy) || !inside(area.cx, area.cy))
    return "The rig's mouth region falls outside the face oval.";
  return null;
}

export const usesDrawnMouth = (config: MouthConfig = DEFAULT_MOUTH_CONFIG): boolean => config.style !== "mesh";

export function meshMouthMode(rig: Rig, drawnMouth: boolean, config: MouthConfig = DEFAULT_MOUTH_CONFIG): MeshMouthMode {
  if (mouthRegionProblem(rig)) return "still";
  if (!drawnMouth || !usesDrawnMouth(config)) return "capped";
  return config.style === "drawn" ? "still" : config.style === "hybrid" ? "hybrid" : "full";
}

export const cappedOpen = (open: number, cap: MeshMouthConfig = MESH_MOUTH_CAP): number => Math.min(cap.openMax, Math.max(0, open) * cap.openGain);
export const cappedForm = (form: number, cap: MeshMouthConfig = MESH_MOUTH_CAP): number => Math.max(-cap.formMax, Math.min(cap.formMax, form * cap.formGain));

const approach = (current: number, goal: number, dtMs: number, cap: MeshMouthConfig): number => {
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) return goal;
  const tau = Math.abs(goal) > Math.abs(current) ? cap.attackMs : cap.releaseMs;
  const next = tau > 0 ? current + (goal - current) * (1 - Math.exp(-dtMs / tau)) : goal;
  return Math.abs(goal - next) < cap.settle ? goal : next;
};

export class MeshMouth {
  readonly out: HeadParameters = { breath: 0, angleX: 0, angleY: 0, angleZ: 0, gazeX: 0, gazeY: 0, eyeOpen: 1, eyeSmile: 0, mouthOpen: 0, mouthForm: 0, browY: 0, browAngle: 0, blush: 0,
    bodyAngleX: 0, bodyAngleZ: 0, armAngle: 0, handAngle: 0, fingerTap: 0, hair: 0 };
  private open = 0;
  private form = 0;

  constructor(public mode: MeshMouthMode, private readonly config: MouthConfig = DEFAULT_MOUTH_CONFIG) {}

  apply(p: HeadParameters, dtMs: number): HeadParameters {
    if (this.mode === "full") return p;
    const out = Object.assign(this.out, p);
    if (this.mode === "still") { out.mouthOpen = 0; out.mouthForm = 0; this.open = 0; this.form = 0; return out; }
    const cap = this.mode === "hybrid" ? this.config.hybrid : this.config.mesh;
    this.open = approach(this.open, cappedOpen(p.mouthOpen, cap), dtMs, cap);
    this.form = approach(this.form, cappedForm(p.mouthForm, cap), dtMs, cap);
    out.mouthOpen = this.open; out.mouthForm = this.form;
    return out;
  }
}

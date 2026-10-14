import type { HeadParameters } from "./drivers";
import type { Rig } from "./types";

export const MESH_MOUTH_CAP = { openGain: 0.18, openMax: 0.15, formGain: 0.2, formMax: 0.12, attackMs: 35, releaseMs: 50, settle: 0.002 } as const;
export const MOUTH_REGION_MIN_WIDTH = 2;
export type MeshMouthMode = "full" | "capped" | "still";

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

export const meshMouthMode = (rig: Rig, drawnMouth: boolean): MeshMouthMode =>
  mouthRegionProblem(rig) ? "still" : drawnMouth ? "full" : "capped";

export const cappedOpen = (open: number): number => Math.min(MESH_MOUTH_CAP.openMax, Math.max(0, open) * MESH_MOUTH_CAP.openGain);
export const cappedForm = (form: number): number => Math.max(-MESH_MOUTH_CAP.formMax, Math.min(MESH_MOUTH_CAP.formMax, form * MESH_MOUTH_CAP.formGain));

const approach = (current: number, goal: number, dtMs: number): number => {
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) return goal;
  const tau = Math.abs(goal) > Math.abs(current) ? MESH_MOUTH_CAP.attackMs : MESH_MOUTH_CAP.releaseMs;
  const next = current + (goal - current) * (1 - Math.exp(-dtMs / tau));
  return Math.abs(goal - next) < MESH_MOUTH_CAP.settle ? goal : next;
};

export class MeshMouth {
  readonly out: HeadParameters = { breath: 0, angleX: 0, angleY: 0, angleZ: 0, gazeX: 0, gazeY: 0, eyeOpen: 1, eyeSmile: 0, mouthOpen: 0, mouthForm: 0, browY: 0, browAngle: 0, blush: 0 };
  private open = 0;
  private form = 0;

  constructor(public mode: MeshMouthMode) {}

  apply(p: HeadParameters, dtMs: number): HeadParameters {
    if (this.mode === "full") return p;
    const out = Object.assign(this.out, p);
    if (this.mode === "still") { out.mouthOpen = 0; out.mouthForm = 0; this.open = 0; this.form = 0; return out; }
    this.open = approach(this.open, cappedOpen(p.mouthOpen), dtMs);
    this.form = approach(this.form, cappedForm(p.mouthForm), dtMs);
    out.mouthOpen = this.open; out.mouthForm = this.form;
    return out;
  }
}

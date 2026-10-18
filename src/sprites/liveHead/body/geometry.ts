import type { HeadParameters } from "../drivers";
import type { HairInput } from "../geometry";
import type { Point } from "../types";
import type { BodyArm, BodyRig } from "./types";

export const BODY_STRIDE = 5;
export const ARM_HANG = 0.85;
const HEAD_NOD = 0.05, HEAD_TURN = 0.06, CHEST_SPREAD = 0.01, REST_FALL = 10;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const segmentDistance = (x: number, y: number, a: Point, b: Point): { d: number; u: number } => {
  const vx = b[0] - a[0], vy = b[1] - a[1], u = Math.min(1, Math.max(0, ((x - a[0]) * vx + (y - a[1]) * vy) / Math.max(1e-9, vx * vx + vy * vy)));
  return { d: Math.hypot(x - a[0] - vx * u, y - a[1] - vy * u), u };
};

export function insideOutline(outline: Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function outlineDistance(outline: Point[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) best = Math.min(best, segmentDistance(x, y, outline[i], outline[(i + 1) % outline.length]).d);
  return best;
}

export function armProgress(arm: BodyArm, x: number, y: number): number {
  const upper = segmentDistance(x, y, arm.shoulder, arm.elbow), lower = segmentDistance(x, y, arm.elbow, arm.wrist);
  const a = Math.hypot(arm.elbow[0] - arm.shoulder[0], arm.elbow[1] - arm.shoulder[1]), b = Math.hypot(arm.wrist[0] - arm.elbow[0], arm.wrist[1] - arm.elbow[1]);
  return upper.d <= lower.d ? upper.u * a / (a + b) : (a + lower.u * b) / (a + b);
}

export function foreWeight(arm: BodyArm, x: number, y: number): number {
  const ex = arm.elbow[0], ey = arm.elbow[1], ux = arm.shoulder[0] - ex, uy = arm.shoulder[1] - ey, wx = arm.wrist[0] - ex, wy = arm.wrist[1] - ey;
  const turn = Math.sign(ux * wy - uy * wx) || 1, inner = Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy) / Math.max(1e-9, Math.hypot(ux, uy) * Math.hypot(wx, wy)))));
  const dx = x - ex, dy = y - ey;
  if (dx === 0 && dy === 0) return 0.5;
  let angle = Math.atan2(turn * (ux * dy - uy * dx), ux * dx + uy * dy);
  if (angle < 0) angle += Math.PI * 2;
  const outer = Math.PI * 2 - inner;
  return angle <= inner ? smooth(inner * 0.25, inner * 0.75, angle) : 1 - smooth(inner + outer * 0.25, inner + outer * 0.75, angle);
}

const torsoAt = (rig: BodyRig, y: number): number => 1 - smooth(rig.torso.waistBand[0], rig.torso.waistBand[1], y);
const breathAt = (rig: BodyRig, y: number): number => 1 - smooth(rig.torso.breathBand[0], rig.torso.breathBand[1], y);

export function bodyWeightsInto(rig: BodyRig, x: number, y: number, out: Float64Array, at: number): void {
  const head = rig.head, chest = rig.torso.chest;
  let torso = torsoAt(rig, y), breath = breathAt(rig, y);
  let headWeight = (1 - smooth(head.band[0], head.band[1], y)) * (1 - smooth(head.side[0] * head.rx, head.side[1] * head.rx, Math.abs(x - head.cx)));
  for (const arm of rig.arms ?? []) {
    if (arm.state !== "resting") continue;
    const mask = insideOutline(arm.outline, x, y) ? 1 : 1 - smooth(0, REST_FALL, outlineDistance(arm.outline, x, y));
    if (mask <= 0) continue;
    const along = 1 - smooth(0.1, 0.85, armProgress(arm, x, y));
    torso += (torsoAt(rig, arm.shoulder[1]) * along - torso) * mask;
    breath += (breathAt(rig, arm.shoulder[1]) * along - breath) * mask;
    headWeight *= 1 - mask;
  }
  const bump = 1 - ((x - head.cx) / head.rx) ** 2 - ((y - head.cy) / head.ry) ** 2;
  out[at] = torso; out[at + 1] = breath;
  out[at + 2] = Math.exp(-(((x - chest.cx) / chest.rx) ** 2 + ((y - chest.cy) / chest.ry) ** 2));
  out[at + 3] = headWeight; out[at + 4] = smooth(0, 0.84, bump);
}

export function bodyWeights(rig: BodyRig, rest: Float32Array): Float64Array {
  const weights = new Float64Array(rest.length / 2 * BODY_STRIDE);
  for (let i = 0, k = 0; i < rest.length; i += 2, k += BODY_STRIDE) bodyWeightsInto(rig, rest[i], rest[i + 1], weights, k);
  return weights;
}

export class BodyFrame {
  headRoll = 0; headCos = 1; headSin = 0; nod = 0; turn = 0;
  breathY = 0; breathX = 0; swayX = 0; roll = 0; rollCos = 1; rollSin = 0;

  constructor(private readonly rig: BodyRig) {}

  set(p: HeadParameters): this {
    const rig = this.rig;
    this.headRoll = -p.angleZ / 30 * rig.head.maxRoll; this.headCos = Math.cos(this.headRoll); this.headSin = Math.sin(this.headRoll);
    this.nod = -p.angleY / 30 * HEAD_NOD * rig.head.ry; this.turn = p.angleX / 30 * HEAD_TURN * rig.head.rx;
    this.breathY = p.breath * rig.torso.breath; this.breathX = p.breath * CHEST_SPREAD;
    this.swayX = p.bodyAngleX / 10 * rig.torso.sway;
    this.roll = -p.bodyAngleZ / 10 * rig.torso.maxRoll; this.rollCos = Math.cos(this.roll); this.rollSin = Math.sin(this.roll);
    return this;
  }
}

export function deformBodyPoint(rig: BodyRig, f: BodyFrame, xy: ArrayLike<number>, si: number, w: Float64Array, k: number, out: { [index: number]: number }, at: number): void {
  const head = rig.head, torso = rig.torso;
  let px = xy[si], py = xy[si + 1];
  const hw = w[k + 3];
  if (hw > 0) {
    if (f.headRoll !== 0) {
      const c = hw === 1 ? f.headCos : Math.cos(f.headRoll * hw), s = hw === 1 ? f.headSin : Math.sin(f.headRoll * hw), dx = px - head.pivotX, dy = py - head.pivotY;
      px = head.pivotX + dx * c - dy * s; py = head.pivotY + dx * s + dy * c;
    }
    py += f.nod * hw; px += f.turn * hw * w[k + 4];
  }
  if (f.breathY !== 0) {
    py -= f.breathY * w[k + 1];
    px += (px - torso.chest.cx) * f.breathX * w[k + 2];
  }
  const tw = w[k];
  if (tw > 0 && (f.swayX !== 0 || f.roll !== 0)) {
    px += f.swayX * tw;
    const c = tw === 1 ? f.rollCos : Math.cos(f.roll * tw), s = tw === 1 ? f.rollSin : Math.sin(f.roll * tw), dx = px - torso.pivotX, dy = py - torso.pivotY;
    px = torso.pivotX + dx * c - dy * s; py = torso.pivotY + dx * s + dy * c;
  }
  out[at] = px; out[at + 1] = py;
}

const moved = new Float64Array(2);

export function deformBody(rig: BodyRig, f: BodyFrame, rest: Float32Array, w: Float64Array, out: Float32Array, hair: HairInput | null): void {
  for (let i = 0, k = 0; i < rest.length; i += 2, k += BODY_STRIDE) {
    if (!hair || hair.start[i >> 1] === hair.start[(i >> 1) + 1]) { deformBodyPoint(rig, f, rest, i, w, k, out, i); continue; }
    let x = rest[i], y = rest[i + 1];
    {
      const offsets = hair.offsets, stride = hair.stride;
      for (let h = hair.start[i >> 1], end = hair.start[(i >> 1) + 1]; h < end; h++) {
        const s = hair.strand[h], last = hair.nodes[s] - 1, t = hair.t[h] * last, n = Math.min(last - 1, Math.floor(t)), u = t - n, weight = hair.weight[h];
        const o = s * stride + n * 2;
        x += (offsets[o] + (offsets[o + 2] - offsets[o]) * u) * weight;
        y += (offsets[o + 1] + (offsets[o + 3] - offsets[o + 1]) * u) * weight;
      }
    }
    moved[0] = x; moved[1] = y;
    deformBodyPoint(rig, f, moved, 0, w, k, out, i);
  }
}

export class ArmPose {
  shoulderX = 0; shoulderY = 0; cos = 1; sin = 0;
  upperCos = 1; upperSin = 0; elbowX = 0; elbowY = 0; fore = 0; foreCos = 1; foreSin = 0;
  private readonly at = new Float64Array(2);
  private readonly weights = new Float64Array(BODY_STRIDE);

  constructor(private readonly rig: BodyRig, readonly arm: BodyArm) {
    bodyWeightsInto(rig, arm.shoulder[0], arm.shoulder[1], this.weights, 0);
  }

  torsoWeight(): number { return this.weights[0]; }

  set(f: BodyFrame, upper: number, fore: number): void {
    const arm = this.arm, s = arm.shoulder, e = arm.elbow, tw = this.weights[0];
    deformBodyPoint(this.rig, f, s, 0, this.weights, 0, this.at, 0);
    this.shoulderX = this.at[0]; this.shoulderY = this.at[1];
    this.cos = Math.cos(f.roll * tw); this.sin = Math.sin(f.roll * tw);
    this.upperCos = Math.cos(upper); this.upperSin = Math.sin(upper);
    const dx = e[0] - s[0], dy = e[1] - s[1];
    this.elbowX = s[0] + dx * this.upperCos - dy * this.upperSin; this.elbowY = s[1] + dx * this.upperSin + dy * this.upperCos;
    this.fore = fore; this.foreCos = Math.cos(fore); this.foreSin = Math.sin(fore);
  }

  deform(rest: Float32Array, fore: Float64Array, out: Float32Array): void {
    const s = this.arm.shoulder;
    for (let i = 0; i < rest.length; i += 2) {
      const dx = rest[i] - s[0], dy = rest[i + 1] - s[1];
      let x = s[0] + dx * this.upperCos - dy * this.upperSin, y = s[1] + dx * this.upperSin + dy * this.upperCos;
      const w = fore[i >> 1];
      if (w > 0 && this.fore !== 0) {
        const c = w === 1 ? this.foreCos : Math.cos(this.fore * w), sn = w === 1 ? this.foreSin : Math.sin(this.fore * w), ex = x - this.elbowX, ey = y - this.elbowY;
        x = this.elbowX + ex * c - ey * sn; y = this.elbowY + ex * sn + ey * c;
      }
      const lx = x - s[0], ly = y - s[1];
      out[i] = this.shoulderX + lx * this.cos - ly * this.sin; out[i + 1] = this.shoulderY + lx * this.sin + ly * this.cos;
    }
  }
}

export function armForeWeights(arm: BodyArm, rest: Float32Array): Float64Array {
  const weights = new Float64Array(rest.length / 2);
  for (let i = 0; i < rest.length; i += 2) weights[i >> 1] = foreWeight(arm, rest[i], rest[i + 1]);
  return weights;
}

export function invertedTriangles(rest: Float32Array, pos: Float32Array, triangles: Uint32Array): number {
  let count = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 2, b = triangles[t + 1] * 2, c = triangles[t + 2] * 2;
    const before = (rest[b] - rest[a]) * (rest[c + 1] - rest[a + 1]) - (rest[b + 1] - rest[a + 1]) * (rest[c] - rest[a]);
    const after = (pos[b] - pos[a]) * (pos[c + 1] - pos[a + 1]) - (pos[b + 1] - pos[a + 1]) * (pos[c] - pos[a]);
    if (before !== 0 && (after === 0 || Math.sign(after) !== Math.sign(before))) count++;
  }
  return count;
}

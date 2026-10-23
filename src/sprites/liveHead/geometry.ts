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
import type { Ellipse, Eye, Point, Rig } from "./types";
import type { HeadParameters } from "./drivers";
import type { Rect } from "./manifest";

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gaussian = (x: number, y: number, e: Ellipse): number => Math.exp(-(((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2));
const sampled = (values: number[], u: number): number => {
  const f = Math.min(1, Math.max(0, u)) * 23, i = Math.min(Math.floor(f), 22);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
};

const TAP_STEPS = [-2, -1, 0, 1, 2], TAP_WEIGHTS = [1, 2, 3, 2, 1];
const LID_BANDS = new WeakMap<Rig, [number, number]>();

export function lidGuard(rig: Rig): [number, number] {
  let band = LID_BANDS.get(rig);
  if (!band) {
    const tops = rig.eyes.flatMap((eye) => eye.top), top = tops.length ? Math.min(...tops) : Number.POSITIVE_INFINITY;
    const height = Math.max(0, ...rig.eyes.map((eye) => sampled(eye.bot, 0.5) - sampled(eye.top, 0.5)));
    band = [top - 2 - Math.max(3, height * 0.6), top - 2];
    LID_BANDS.set(rig, band);
  }
  return band;
}

export function browWeight(rig: Rig, x: number, y: number): number {
  const brow = rig.face.brow, lid = lidGuard(rig);
  return gaussian(x, y, brow) * (1 - smooth(brow.band[0], brow.band[1], y)) * (1 - smooth(lid[0], lid[1], y));
}

export function eyeVertexY(eye: Eye, part: string, x: number, y: number, open: number, smile: number): number {
  if (part !== "lash" && part !== "low" && part !== "crease") return y;
  const span = eye.x1 - eye.x0, u = (x - eye.x0) / span;
  const b = 1 - open, height = sampled(eye.bot, 0.5) - sampled(eye.top, 0.5), lead = Math.max(b, -0.07);
  const first = eye.top[0], slope = eye.top[23] - eye.top[0];
  let lift = 0, drop = 0;
  for (let k = 0; k < 5; k++) {
    const t = Math.min(1, Math.max(0, u + TAP_STEPS[k] * 5 / span));
    const top = sampled(eye.top, t), bot = sampled(eye.bot, t);
    const arc = first + slope * t - 0.3 * height * 4 * t * (1 - t);
    const closed = Math.max(top, bot + 1 + (arc - bot - 1) * smile);
    lift += (closed - top) * lead * TAP_WEIGHTS[k] / 9;
    drop += (b > 0 ? (closed - bot) * b * smile : 0) * TAP_WEIGHTS[k] / 9;
  }
  if (part === "lash") return sampled(eye.top, u) + lift - (sampled(eye.top, u) - y) * (1 - 0.3 * Math.min(1, Math.max(0, 1 - open)));
  if (part === "low") return y + drop;
  return y + lift * 0.22;
}

export function deformInto(rig: Rig, x: number, y: number, p: HeadParameters, out: { [index: number]: number }, at = 0): void {
  const head = rig.head, body = rig.body, face = rig.face;
  const ax = p.angleX / 30, ay = p.angleY / 30;
  let px = x, py = y;
  if (p.browY !== 0 || p.browAngle !== 0) {
    const brow = browWeight(rig, x, y);
    py -= p.browY * 7 * brow;
    py += (x - face.brow.cx) * Math.sin(p.browAngle * 0.12 * brow);
  }
  if (p.mouthOpen !== 0) py += p.mouthOpen * 3.5 * gaussian(x, y, face.jaw) * smooth(face.jaw.band[0], face.jaw.band[1], y);
  if (ax !== 0) {
    px += ax * (8 * gaussian(x, y, face.nose) + 5 * gaussian(x, y, face.mouth))
      + (x - face.eyeA.cx) * 0.12 * ax * gaussian(x, y, face.eyeA) - (x - face.eyeB.cx) * 0.12 * ax * gaussian(x, y, face.eyeB)
      - ax * 9 * gaussian(x, y, face.earR) + ax * 4 * gaussian(x, y, face.earL);
  }
  if (ay !== 0) {
    py -= ay * (6 * gaussian(x, y, face.nose) + 3 * gaussian(x, y, face.mouth));
    py += (y - face.eyeA.cy) * -0.06 * Math.abs(ay) * gaussian(x, y, face.eyeA) + (y - face.eyeB.cy) * -0.06 * Math.abs(ay) * gaussian(x, y, face.eyeB);
  }
  if (ax !== 0 || ay !== 0) {
    const bump = 1 - ((px - head.cx) / head.rx) ** 2 - ((py - head.cy) / head.ry) ** 2;
    const turn = smooth(0, 0.84, bump) * (1 - smooth(head.turnBand[0], head.turnBand[1], y));
    px += ax * head.shiftX * turn; py -= ay * head.shiftY * turn;
  }
  if (p.angleZ !== 0) {
    const angle = -p.angleZ / 30 * head.maxRoll * (1 - smooth(head.weightBand[0], head.weightBand[1], y));
    const dx = px - head.pivotX, dy = py - head.pivotY;
    px = head.pivotX + dx * Math.cos(angle) - dy * Math.sin(angle);
    py = head.pivotY + dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  if (p.breath !== 0) {
    let shoulders = 0;
    for (const shoulder of body.shoulders) shoulders += gaussian(x, y, shoulder);
    py -= p.breath * (5 * (1 - smooth(body.breathBand[0], body.breathBand[1], y)) + 4 * shoulders);
    px += (px - body.chest.cx) * 0.012 * p.breath * gaussian(x, y, body.chest);
  }
  if (p.bodyAngleX !== 0 || p.bodyAngleZ !== 0) {
    const roll = 1 - smooth(body.rollBand[0], body.rollBand[1], y);
    px += p.bodyAngleX / 10 * (SWAY_BASE + SWAY_CHEST * gaussian(x, y, body.chest)) * head.rx / SWAY_HEAD * roll;
    const angle = -p.bodyAngleZ / 10 * body.maxRoll * roll, dx = px - body.pivotX, dy = py - body.pivotY, c = Math.cos(angle), s = Math.sin(angle);
    px = body.pivotX + dx * c - dy * s; py = body.pivotY + dx * s + dy * c;
  }
  out[at] = px; out[at + 1] = py;
}

const SWAY_BASE = 7, SWAY_CHEST = 9, SWAY_HEAD = 430;

export function headPointInto(rig: Rig, x: number, y: number, p: HeadParameters, weight: number, turnWeight: number, out: { [index: number]: number }, at = 0, breathWeight = 1): void {
  const head = rig.head, body = rig.body;
  let px = x, py = y;
  const ax = p.angleX / 30, ay = p.angleY / 30;
  if ((ax !== 0 || ay !== 0) && turnWeight > 0) {
    const bump = 1 - ((x - head.cx) / head.rx) ** 2 - ((y - head.cy) / head.ry) ** 2;
    const turn = smooth(0, 0.84, bump) * turnWeight;
    px += ax * head.shiftX * turn; py -= ay * head.shiftY * turn;
  }
  if (p.angleZ !== 0 && weight > 0) {
    const angle = -p.angleZ / 30 * head.maxRoll * weight, dx = px - head.pivotX, dy = py - head.pivotY, c = Math.cos(angle), s = Math.sin(angle);
    px = head.pivotX + dx * c - dy * s; py = head.pivotY + dx * s + dy * c;
  }
  py -= p.breath * 5 * breathWeight * (1 - smooth(body.breathBand[0], body.breathBand[1], y));
  const roll = 1 - smooth(body.rollBand[0], body.rollBand[1], y);
  px += p.bodyAngleX / 10 * SWAY_BASE * head.rx / SWAY_HEAD * roll;
  const angle = -p.bodyAngleZ / 10 * body.maxRoll * roll, dx = px - body.pivotX, dy = py - body.pivotY, c = Math.cos(angle), s = Math.sin(angle);
  out[at] = body.pivotX + dx * c - dy * s; out[at + 1] = body.pivotY + dx * s + dy * c;
}

export const headWeightAt = (rig: Rig, y: number): number => 1 - smooth(rig.head.weightBand[0], rig.head.weightBand[1], y);
export const turnWeightAt = (rig: Rig, y: number): number => 1 - smooth(rig.head.turnBand[0], rig.head.turnBand[1], y);

export interface HairInput { start: Uint32Array; strand: Uint16Array; weight: Float32Array; t: Float32Array; nodes: Uint8Array; offsets: Float64Array; stride: number }

export const WEIGHT_STRIDE = 15;

export function vertexWeights(rig: Rig, rest: Float32Array): Float64Array {
  const head = rig.head, body = rig.body, face = rig.face, weights = new Float64Array(rest.length / 2 * WEIGHT_STRIDE);
  for (let i = 0, k = 0; i < rest.length; i += 2, k += WEIGHT_STRIDE) {
    const x = rest[i], y = rest[i + 1];
    weights[k] = browWeight(rig, x, y);
    weights[k + 1] = gaussian(x, y, face.jaw); weights[k + 2] = smooth(face.jaw.band[0], face.jaw.band[1], y);
    weights[k + 3] = gaussian(x, y, face.nose); weights[k + 4] = gaussian(x, y, face.mouth);
    weights[k + 5] = gaussian(x, y, face.eyeA); weights[k + 6] = gaussian(x, y, face.eyeB);
    weights[k + 7] = gaussian(x, y, face.earR); weights[k + 8] = gaussian(x, y, face.earL);
    weights[k + 9] = 1 - smooth(head.turnBand[0], head.turnBand[1], y);
    weights[k + 10] = 1 - smooth(head.weightBand[0], head.weightBand[1], y);
    weights[k + 11] = 1 - smooth(body.breathBand[0], body.breathBand[1], y);
    let shoulders = 0;
    for (const shoulder of body.shoulders) shoulders += gaussian(x, y, shoulder);
    weights[k + 12] = shoulders; weights[k + 13] = gaussian(x, y, body.chest);
    weights[k + 14] = 1 - smooth(body.rollBand[0], body.rollBand[1], y);
  }
  return weights;
}

export function deformWeighted(rig: Rig, rest: Float32Array, weights: Float64Array, p: HeadParameters, out: Float32Array, hair: HairInput | null = null): void {
  const head = rig.head, body = rig.body, face = rig.face;
  const ax = p.angleX / 30, ay = p.angleY / 30, roll = -p.angleZ / 30 * head.maxRoll;
  const brows = p.browY !== 0 || p.browAngle !== 0, jaw = p.mouthOpen * 3.5;
  const sway = p.bodyAngleX / 10 * head.rx / SWAY_HEAD, bodyRoll = -p.bodyAngleZ / 10 * body.maxRoll, swaying = p.bodyAngleX !== 0 || p.bodyAngleZ !== 0;
  for (let i = 0, k = 0; i < rest.length; i += 2, k += WEIGHT_STRIDE) {
    const x = rest[i], y = rest[i + 1];
    let px = x, py = y;
    if (hair) {
      const offsets = hair.offsets, stride = hair.stride;
      for (let h = hair.start[i >> 1], end = hair.start[(i >> 1) + 1]; h < end; h++) {
        const s = hair.strand[h], last = hair.nodes[s] - 1, f = hair.t[h] * last, n = Math.min(last - 1, Math.floor(f)), u = f - n, w = hair.weight[h];
        const o = s * stride + n * 2;
        px += (offsets[o] + (offsets[o + 2] - offsets[o]) * u) * w;
        py += (offsets[o + 1] + (offsets[o + 3] - offsets[o + 1]) * u) * w;
      }
    }
    if (brows) {
      const brow = weights[k];
      py -= p.browY * 7 * brow;
      py += (x - face.brow.cx) * Math.sin(p.browAngle * 0.12 * brow);
    }
    if (p.mouthOpen !== 0) py += jaw * weights[k + 1] * weights[k + 2];
    if (ax !== 0) {
      px += ax * (8 * weights[k + 3] + 5 * weights[k + 4])
        + (x - face.eyeA.cx) * 0.12 * ax * weights[k + 5] - (x - face.eyeB.cx) * 0.12 * ax * weights[k + 6]
        - ax * 9 * weights[k + 7] + ax * 4 * weights[k + 8];
    }
    if (ay !== 0) {
      py -= ay * (6 * weights[k + 3] + 3 * weights[k + 4]);
      py += (y - face.eyeA.cy) * -0.06 * Math.abs(ay) * weights[k + 5] + (y - face.eyeB.cy) * -0.06 * Math.abs(ay) * weights[k + 6];
    }
    if (ax !== 0 || ay !== 0) {
      const bump = 1 - ((px - head.cx) / head.rx) ** 2 - ((py - head.cy) / head.ry) ** 2;
      const t = Math.min(1, Math.max(0, bump / 0.84)), turn = t * t * (3 - 2 * t) * weights[k + 9];
      px += ax * head.shiftX * turn; py -= ay * head.shiftY * turn;
    }
    if (p.angleZ !== 0) {
      const angle = roll * weights[k + 10];
      const dx = px - head.pivotX, dy = py - head.pivotY;
      px = head.pivotX + dx * Math.cos(angle) - dy * Math.sin(angle);
      py = head.pivotY + dx * Math.sin(angle) + dy * Math.cos(angle);
    }
    if (p.breath !== 0) {
      py -= p.breath * (5 * weights[k + 11] + 4 * weights[k + 12]);
      px += (px - body.chest.cx) * 0.012 * p.breath * weights[k + 13];
    }
    if (swaying) {
      const rollWeight = weights[k + 14];
      px += sway * (SWAY_BASE + SWAY_CHEST * weights[k + 13]) * rollWeight;
      const angle = bodyRoll * rollWeight, dx = px - body.pivotX, dy = py - body.pivotY, c = Math.cos(angle), sn = Math.sin(angle);
      px = body.pivotX + dx * c - dy * sn; py = body.pivotY + dx * sn + dy * c;
    }
    out[i] = px; out[i + 1] = py;
  }
}

export function deformVertex(rig: Rig, x: number, y: number, p: HeadParameters): Point {
  const out: [number, number] = [0, 0];
  deformInto(rig, x, y, p, out);
  return out;
}

export interface HeadMesh { rest: Float32Array; pos: Float32Array; uv: Float32Array; triangles: Uint32Array }
export function headGrid(rect: Rect, cell: number): HeadMesh {
  const [x, y, width, height] = rect, cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const rest = new Float32Array((cols + 1) * (rows + 1) * 2), uv = new Float32Array(rest.length), triangles: number[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const index = (j * (cols + 1) + i) * 2, px = Math.min(width, i * cell), py = Math.min(height, j * cell);
    rest[index] = x + px; rest[index + 1] = y + py; uv[index] = px / width; uv[index + 1] = py / height;
    if (j < rows && i < cols) {
      const a = index / 2, b = a + 1, c = a + cols + 1;
      triangles.push(a, b, c, b, c + 1, c);
    }
  }
  return { rest, pos: new Float32Array(rest), uv, triangles: new Uint32Array(triangles) };
}

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
import type { Hand, Point, Rig } from "./types";
import type { HeadParameters } from "./drivers";
import { headPointInto, headWeightAt, turnWeightAt } from "./geometry";

export const HAND_STRIDE = 5;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function handWeights(hand: Hand, rest: Float32Array): Float64Array {
  const weights = new Float64Array(rest.length / 2 * HAND_STRIDE);
  for (let i = 0, k = 0; i < rest.length; i += 2, k += HAND_STRIDE) {
    const x = rest[i], y = rest[i + 1];
    weights[k] = 1 - smooth(hand.armBand[0], hand.armBand[1], y);
    weights[k + 1] = 1 - smooth(hand.wristBand[0], hand.wristBand[1], y);
    weights[k + 2] = 1 - smooth(hand.handBand[0], hand.handBand[1], y);
    weights[k + 3] = smooth(hand.fingerXBand[0], hand.fingerXBand[1], x) * (1 - smooth(hand.fingerYBand[0], hand.fingerYBand[1], y));
    weights[k + 4] = smooth(hand.pinBand[0], hand.pinBand[1], y);
  }
  return weights;
}

export class HandBones {
  private readonly contact = new Float64Array(2);
  private readonly elbow = new Float64Array(2);
  private readonly wrist = new Float64Array(2);
  private readonly moved = new Float64Array(2);
  private angle = 0; private cos = 1; private sin = 0;
  private bend = 0; private stretch = 1;
  private elbowDx = 0; private elbowDy = 0;
  private readonly contactHead: number;
  private readonly contactTurn: number;
  private readonly restContact: number;

  constructor(private readonly rig: Rig, private readonly hand: Hand) {
    this.contactHead = headWeightAt(rig, hand.contact[1]);
    this.contactTurn = turnWeightAt(rig, hand.contact[1]);
    this.restContact = Math.atan2(hand.contact[1] - hand.elbow[1], hand.contact[0] - hand.elbow[0]);
  }

  private forearm(x: number, y: number, out: Float64Array): void {
    const e = this.hand.elbow, dx = x - e[0], dy = y - e[1];
    out[0] = e[0] + dx * this.cos - dy * this.sin + this.elbowDx;
    out[1] = e[1] + dx * this.sin + dy * this.cos + this.elbowDy;
  }

  frame(p: HeadParameters): void {
    const hand = this.hand, rig = this.rig;
    headPointInto(rig, hand.contact[0], hand.contact[1], p, this.contactHead, this.contactTurn, this.contact);
    headPointInto(rig, hand.elbow[0], hand.elbow[1], p, 0, 0, this.elbow, 0, 0);
    this.elbowDx = this.elbow[0] - hand.elbow[0]; this.elbowDy = this.elbow[1] - hand.elbow[1];
    const full = Math.atan2(this.contact[1] - this.elbow[1], this.contact[0] - this.elbow[0]) - this.restContact;
    this.angle = full * hand.forearmShare; this.cos = Math.cos(this.angle); this.sin = Math.sin(this.angle);
    this.forearm(hand.wrist[0], hand.wrist[1], this.wrist);
    this.forearm(hand.contact[0], hand.contact[1], this.moved);
    const wx = this.wrist[0], wy = this.wrist[1];
    this.bend = Math.atan2(this.contact[1] - wy, this.contact[0] - wx) - Math.atan2(this.moved[1] - wy, this.moved[0] - wx);
    this.stretch = Math.min(1.03, Math.max(0.97, Math.hypot(this.contact[0] - wx, this.contact[1] - wy) / Math.max(1e-6, Math.hypot(this.moved[0] - wx, this.moved[1] - wy))));
  }

  deform(rest: Float32Array, weights: Float64Array, p: HeadParameters, out: Float32Array): void {
    const hand = this.hand, knuckle = hand.knuckle, wristRest = hand.wrist, elbow = hand.elbow, at = this.moved;
    for (let i = 0, k = 0; i < rest.length; i += 2, k += HAND_STRIDE) {
      const x = rest[i], y = rest[i + 1];
      rotate(x, y, knuckle, p.fingerTap * 0.07 * weights[k + 3]);
      rotate(rotated[0], rotated[1], wristRest, -p.handAngle / 10 * 0.045 * weights[k + 1]);
      rotate(rotated[0], rotated[1], elbow, -p.armAngle / 10 * 0.015 * weights[k]);
      this.forearm(rotated[0], rotated[1], at);
      const bend = this.bend * weights[k + 2], scale = 1 + (this.stretch - 1) * weights[k + 2];
      const dx = at[0] - this.wrist[0], dy = at[1] - this.wrist[1], c = Math.cos(bend) * scale, s = Math.sin(bend) * scale;
      const py = this.wrist[1] + dx * s + dy * c;
      out[i] = this.wrist[0] + dx * c - dy * s; out[i + 1] = py + (y - py) * weights[k + 4];
    }
  }
}

const rotated = new Float64Array(2);
function rotate(x: number, y: number, origin: Point, angle: number): void {
  if (angle === 0) { rotated[0] = x; rotated[1] = y; return; }
  const c = Math.cos(angle), s = Math.sin(angle), dx = x - origin[0], dy = y - origin[1];
  rotated[0] = origin[0] + dx * c - dy * s; rotated[1] = origin[1] + dx * s + dy * c;
}

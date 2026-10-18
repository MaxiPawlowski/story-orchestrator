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
import type { Ellipse, Rig, Strand } from "./types";
import type { HeadParameters } from "./drivers";
import { headPointInto, type HairInput } from "./geometry";

export const MAX_STRAND_NODES = 8;
const STRAND_K = [0, 300, 200, 140, 110, 90, 75, 65], STRAND_COUPLE = 0.9, STRAND_DAMP = 7;
export const HAIR_TUNE = { stiff: 1.7, damp: 1.6, couple: 0.85, reach: 0.9, bind: 4, wind: 0.18 };
const SUBSTEP = 1 / 240, MAX_DT = 0.05, MAX_SUBSTEPS = 12;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gaussian = (x: number, y: number, e: Ellipse): number => Math.exp(-(((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2));

export const usableStrands = (rig: Rig): Strand[] => (rig.strands ?? []).filter((strand) => strand.nodes.length >= 2 && strand.nodes.length <= MAX_STRAND_NODES);

function onPolyline(x: number, y: number, nodes: Strand["nodes"], out: Float64Array): void {
  let best = Infinity, bestT = 0;
  const n = nodes.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = nodes[i], [bx, by] = nodes[i + 1], vx = bx - ax, vy = by - ay;
    const u = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    const d = Math.hypot(x - ax - vx * u, y - ay - vy * u);
    if (d < best) { best = d; bestT = (i + u) / n; }
  }
  out[0] = best; out[1] = bestT;
}

export function strandField(rig: Rig, rest: Float32Array): HairInput | null {
  return strandWeights(usableStrands(rig), rest, [rig.face.eyeA, rig.face.eyeB].map((eye) => ({ ...eye, rx: eye.rx * 1.15, ry: eye.ry * 1.3 })));
}

export function strandWeights(strands: Strand[], rest: Float32Array, eyes: Ellipse[]): HairInput | null {
  if (!strands.length) return null;
  const count = rest.length / 2, start = new Uint32Array(count + 1), ids: number[] = [], weights: number[] = [], ts: number[] = [], hit = new Float64Array(2);
  const found: Array<[number, number, number]> = [];
  for (let v = 0; v < count; v++) {
    start[v] = ids.length;
    const x = rest[v * 2], y = rest[v * 2 + 1];
    let near = 0;
    for (const eye of eyes) near += gaussian(x, y, eye);
    const keep = 1 - Math.min(1, near) * 1.4;
    if (keep > 0.02) {
      found.length = 0;
      let sum = 0;
      strands.forEach((strand, s) => {
        onPolyline(x, y, strand.nodes, hit);
        const g = Math.exp(-((hit[0] / strand.sigma) ** 2));
        if (g < 0.02) return;
        found.push([s, g, hit[1]]); sum += g;
      });
      const norm = Math.max(1, sum);
      for (const [s, g, t] of found) {
        const w = Math.max(0, keep) * g / norm * smooth(0.04, 0.55, t);
        if (w < 1e-4) continue;
        ids.push(s); weights.push(w); ts.push(t);
      }
    }
  }
  start[count] = ids.length;
  return { start, strand: Uint16Array.from(ids), weight: Float32Array.from(weights), t: Float32Array.from(ts),
    nodes: Uint8Array.from(strands.map((strand) => strand.nodes.length)), offsets: new Float64Array(strands.length * MAX_STRAND_NODES * 2), stride: MAX_STRAND_NODES * 2 };
}

export interface HairHost {
  strands: Strand[];
  anchor(x: number, y: number, p: HeadParameters, out: Float64Array, at: number): void;
  roll(p: HeadParameters): number;
}

const headHost = (rig: Rig): HairHost => ({
  strands: usableStrands(rig),
  anchor: (x, y, p, out, at) => headPointInto(rig, x, y, p, 1, 1, out, at),
  roll: (p) => -p.angleZ / 30 * rig.head.maxRoll - p.bodyAngleZ / 10 * rig.body.maxRoll,
});

export class HairPhysics {
  readonly strands: Strand[];
  readonly offsets: Float64Array;
  private readonly position: Float64Array;
  private readonly velocity: Float64Array;
  private readonly target: Float64Array;
  private readonly hang: Float64Array;
  private readonly neighbours: Int16Array;
  private readonly scratch: Float64Array;
  private started = false;
  private time = 0;
  active = false;

  private readonly host: HairHost;

  constructor(source: Rig | HairHost, offsets?: Float64Array) {
    this.host = "anchor" in source ? source : headHost(source);
    this.strands = this.host.strands;
    const size = this.strands.length * MAX_STRAND_NODES * 2;
    this.offsets = offsets ?? new Float64Array(size);
    this.position = new Float64Array(size); this.velocity = new Float64Array(size); this.target = new Float64Array(size);
    this.hang = new Float64Array(this.strands.length * MAX_STRAND_NODES); this.scratch = new Float64Array(size);
    this.neighbours = new Int16Array(this.strands.length * 2).fill(-1);
    this.strands.forEach((strand, s) => {
      for (let j = 0; j < strand.nodes.length; j++) this.hang[s * MAX_STRAND_NODES + j] = Math.hypot(strand.nodes[j][0] - strand.nodes[0][0], strand.nodes[j][1] - strand.nodes[0][1]);
      const near = (other: number) => other >= 0 && other < this.strands.length
        && Math.hypot(this.strands[other].nodes[0][0] - strand.nodes[0][0], this.strands[other].nodes[0][1] - strand.nodes[0][1]) <= 3 * Math.max(strand.sigma, this.strands[other].sigma)
        && this.strands[other].nodes.length === strand.nodes.length;
      if (near(s - 1)) this.neighbours[s * 2] = s - 1;
      if (near(s + 1)) this.neighbours[s * 2 + 1] = s + 1;
    });
  }

  private held: [number, number] | null = null;

  hold(x: number | null, y = 0): void { this.held = x === null ? null : [x, y]; }

  reset(): void {
    this.started = false; this.active = false; this.time = 0;
    this.offsets.fill(0); this.velocity.fill(0);
  }

  step(p: HeadParameters, dtSeconds: number): Float64Array {
    if (!this.strands.length) return this.offsets;
    if (this.held) return this.pose(this.held[0], this.held[1]);
    if (p.hair <= 0) { if (this.started || this.active) this.reset(); return this.offsets; }
    const host = this.host, stride = MAX_STRAND_NODES * 2, target = this.target, position = this.position, velocity = this.velocity;
    const dt = Math.min(MAX_DT, Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0));
    const sub = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / SUBSTEP))), h = dt / sub;
    const roll = host.roll(p), sinRoll = Math.sin(roll);
    const tune = HAIR_TUNE;
    for (let s = 0; s < this.strands.length; s++) {
      const strand = this.strands[s], base = s * stride, count = strand.nodes.length;
      for (let j = 0; j < count; j++) host.anchor(strand.nodes[j][0], strand.nodes[j][1], p, target, base + j * 2);
      if (!this.started) for (let j = 0; j < count * 2; j++) { position[base + j] = target[base + j]; velocity[base + j] = 0; }
      const phase = s * 1.7;
      for (let i = 0; i < sub; i++) {
        const t = this.time + i * h;
        for (let j = 1; j < count; j++) {
          const at = base + j * 2, parent = at - 2, share = j / (count - 1);
          const wind = (Math.sin(t * 1.3) * 0.5 + Math.sin(t * 3.1) * 0.3 + Math.sin(t * 4.7 + phase) * 0.2) * strand.max * tune.wind * share;
          const tx = target[at] + (position[parent] - target[parent]) * STRAND_COUPLE * tune.couple - sinRoll * this.hang[s * MAX_STRAND_NODES + j] * 0.12 + wind;
          const ty = target[at + 1] + (position[parent + 1] - target[parent + 1]) * STRAND_COUPLE * tune.couple;
          const k = STRAND_K[Math.min(j, STRAND_K.length - 1)] * strand.k * tune.stiff, c = STRAND_DAMP * tune.damp * Math.sqrt(tune.stiff);
          velocity[at] += (k * (tx - position[at]) - c * velocity[at]) * h;
          velocity[at + 1] += (k * (ty - position[at + 1]) - c * velocity[at + 1]) * h;
          position[at] += velocity[at] * h; position[at + 1] += velocity[at + 1] * h;
        }
        position[base] = target[base]; position[base + 1] = target[base + 1];
      }
      for (let j = 0; j < count; j++) {
        const at = base + j * 2, ox = position[at] - target[at], oy = position[at + 1] - target[at + 1];
        const limit = Math.max(0.5, strand.max * tune.reach * j / Math.max(1, count - 1)), length = Math.hypot(ox, oy);
        const scale = length < 1e-6 ? 1 : limit * Math.tanh(length / limit) / length;
        this.offsets[at] = j === 0 ? 0 : ox * scale; this.offsets[at + 1] = j === 0 ? 0 : oy * scale;
      }
    }
    this.bind();
    this.started = true; this.active = true;
    this.time += dt;
    return this.offsets;
  }

  private pose(x: number, y: number): Float64Array {
    const stride = MAX_STRAND_NODES * 2;
    this.strands.forEach((strand, s) => {
      const count = strand.nodes.length;
      for (let j = 0; j < count; j++) {
        const limit = strand.max * HAIR_TUNE.reach * j / Math.max(1, count - 1);
        this.offsets[s * stride + j * 2] = x * limit; this.offsets[s * stride + j * 2 + 1] = y * limit;
      }
    });
    this.active = true;
    return this.offsets;
  }

  private bind(): void {
    const stride = MAX_STRAND_NODES * 2, offsets = this.offsets, scratch = this.scratch, neighbours = this.neighbours;
    for (let pass = 0; pass < HAIR_TUNE.bind; pass++) {
      scratch.set(offsets);
      for (let s = 0; s < this.strands.length; s++) {
        const left = neighbours[s * 2], right = neighbours[s * 2 + 1];
        if (left < 0 && right < 0) continue;
        const l = left < 0 ? s : left, r = right < 0 ? s : right;
        for (let j = 2; j < this.strands[s].nodes.length * 2; j++)
          offsets[s * stride + j] = scratch[s * stride + j] * 0.5 + (scratch[l * stride + j] + scratch[r * stride + j]) * 0.25;
      }
    }
  }
}

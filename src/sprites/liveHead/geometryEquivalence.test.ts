import { syntheticHead } from "./synthetic";
import { restHead, type HeadParameters } from "./drivers";
import { deformInto, deformVertex, deformWeighted, eyeVertexY, headGrid, vertexWeights } from "./geometry";
import type { Band, Ellipse, Eye, Point, Rig } from "./types";

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gaussian = (x: number, y: number, e: Ellipse): number => Math.exp(-(((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2));
const sampled = (values: number[], u: number): number => {
  const f = Math.min(1, Math.max(0, u)) * 23, i = Math.min(Math.floor(f), 22);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
};

function referenceEye(eye: Eye, part: string, x: number, y: number, open: number, smile: number): number {
  const raw = (u: number): Point => {
    u = Math.min(1, Math.max(0, u));
    const top = sampled(eye.top, u), bot = sampled(eye.bot, u), b = 1 - open;
    const height = sampled(eye.bot, 0.5) - sampled(eye.top, 0.5);
    const arc = eye.top[0] + (eye.top[23] - eye.top[0]) * u - 0.3 * height * 4 * u * (1 - u);
    const closed = Math.max(top, bot + 1 + (arc - bot - 1) * smile);
    return [(closed - top) * Math.max(b, -0.07), b > 0 ? (closed - bot) * b * smile : 0];
  };
  const u = (x - eye.x0) / (eye.x1 - eye.x0);
  const moves: Point = [0, 0];
  for (const [tap, weight] of [[-2, 1], [-1, 2], [0, 3], [1, 2], [2, 1]]) {
    const step = raw(u + tap * 5 / (eye.x1 - eye.x0));
    moves[0] += step[0] * weight / 9; moves[1] += step[1] * weight / 9;
  }
  if (part === "lash") return sampled(eye.top, u) + moves[0] - (sampled(eye.top, u) - y) * (1 - 0.3 * Math.min(1, Math.max(0, 1 - open)));
  if (part === "low") return y + moves[1];
  if (part === "crease") return y + moves[0] * 0.22;
  return y;
}

function referenceDeform(rig: Rig, x: number, y: number, p: HeadParameters): Point {
  const head = rig.head, body = rig.body, face = rig.face;
  const weight = (e: Ellipse) => gaussian(x, y, e);
  const band = (b: Band, v: number) => smooth(b[0], b[1], v);
  const ax = p.angleX / 30, ay = p.angleY / 30;
  let px = x, py = y;
  const brow = weight(face.brow) * (1 - band(face.brow.band, y));
  py -= p.browY * 7 * brow;
  py += (x - face.brow.cx) * Math.sin(p.browAngle * 0.12 * brow);
  py += p.mouthOpen * 3.5 * weight(face.jaw) * band(face.jaw.band, y);
  px += ax * (8 * weight(face.nose) + 5 * weight(face.mouth))
    + (x - face.eyeA.cx) * 0.12 * ax * weight(face.eyeA) - (x - face.eyeB.cx) * 0.12 * ax * weight(face.eyeB)
    - ax * 9 * weight(face.earR) + ax * 4 * weight(face.earL);
  py -= ay * (6 * weight(face.nose) + 3 * weight(face.mouth));
  py += (y - face.eyeA.cy) * -0.06 * Math.abs(ay) * weight(face.eyeA) + (y - face.eyeB.cy) * -0.06 * Math.abs(ay) * weight(face.eyeB);
  const bump = 1 - ((px - head.cx) / head.rx) ** 2 - ((py - head.cy) / head.ry) ** 2;
  const turn = smooth(0, 0.84, bump) * (1 - band(head.turnBand, y));
  px += ax * head.shiftX * turn; py -= ay * head.shiftY * turn;
  const angle = -p.angleZ / 30 * head.maxRoll * (1 - band(head.weightBand, y));
  const dx = px - head.pivotX, dy = py - head.pivotY;
  px = head.pivotX + dx * Math.cos(angle) - dy * Math.sin(angle);
  py = head.pivotY + dx * Math.sin(angle) + dy * Math.cos(angle);
  py -= p.breath * (5 * (1 - band(body.breathBand, y)) + 4 * body.shoulders.reduce((sum, e) => sum + weight(e), 0));
  px += (px - body.chest.cx) * 0.012 * p.breath * weight(body.chest);
  const roll = 1 - band(body.rollBand, y);
  px += p.bodyAngleX / 10 * (7 + 9 * weight(body.chest)) * head.rx / 430 * roll;
  const bodyAngle = -p.bodyAngleZ / 10 * body.maxRoll * roll, bx = px - body.pivotX, by = py - body.pivotY;
  return [body.pivotX + bx * Math.cos(bodyAngle) - by * Math.sin(bodyAngle), body.pivotY + bx * Math.sin(bodyAngle) + by * Math.cos(bodyAngle)];
}

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ranges: Partial<Record<keyof HeadParameters, [number, number]>> = { angleX: [-30, 30], angleY: [-30, 30], angleZ: [-30, 30], eyeOpen: [0, 1], eyeSmile: [0, 1], mouthOpen: [0, 1],
  breath: [-1, 1], browY: [-1, 1], browAngle: [-1, 1], gazeX: [-1, 1], gazeY: [-1, 1], bodyAngleX: [-10, 10], bodyAngleZ: [-10, 10] };

function parameters(random: () => number, zeroed: ReadonlySet<string>): HeadParameters {
  const value: Record<string, number> = { ...restHead() };
  for (const key of Object.keys(value)) {
    if (zeroed.has(key)) { value[key] = key === "eyeOpen" ? 1 : 0; continue; }
    const [low, high] = ranges[key as keyof HeadParameters] ?? [-1, 1];
    value[key] = low + (high - low) * random();
  }
  return value as unknown as HeadParameters;
}

const rig = syntheticHead.rig;
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe("the allocation-free deformation equals the original formulas", () => {
  test("every head part and parameter mix, including zeroed parameters that skip work", () => {
    const random = seeded(7);
    const keys = Object.keys(restHead());
    const mesh = headGrid([0, 0, rig.image.width, rig.image.height], 16);
    for (let round = 0; round < 60; round += 1) {
      const zeroed = new Set(keys.filter(() => random() < 0.45));
      const p = parameters(random, zeroed);
      const out = new Float64Array(2);
      for (let i = 0; i < mesh.rest.length; i += 2 * 17) {
        const x = mesh.rest[i], y = mesh.rest[i + 1], expected = referenceDeform(rig, x, y, p);
        deformInto(rig, x, y, p, out, 0);
        near(out[0], expected[0]); near(out[1], expected[1]);
        const wrapped = deformVertex(rig, x, y, p);
        near(wrapped[0], expected[0]); near(wrapped[1], expected[1]);
      }
    }
  });

  test("eye lash, lower lid, crease and ball vertices across open and smile values", () => {
    const random = seeded(11);
    for (const eye of rig.eyes) for (const part of ["lash", "low", "crease", "ball", "iris", ""]) {
      for (let round = 0; round < 80; round += 1) {
        const x = eye.x0 - 6 + (eye.x1 - eye.x0 + 12) * random(), y = eye.top[12] - 8 + 30 * random();
        const open = round % 7 === 0 ? 1 : random() * 1.1 - 0.05, smile = round % 5 === 0 ? 0 : random();
        near(eyeVertexY(eye, part, x, y, open, smile), referenceEye(eye, part, x, y, open, smile));
      }
    }
  });

  test("precomputed vertex weights deform bit-identically to the per-vertex formulas", () => {
    const random = seeded(13), keys = Object.keys(restHead());
    for (const layer of syntheticHead.layers) {
      const mesh = headGrid(layer.rect, 4), weights = vertexWeights(rig, mesh.rest);
      const fast = new Float32Array(mesh.rest.length), slow = new Float32Array(mesh.rest.length);
      for (let round = 0; round < 12; round += 1) {
        const p = parameters(random, new Set(keys.filter(() => random() < 0.3)));
        deformWeighted(rig, mesh.rest, weights, p, fast);
        for (let i = 0; i < mesh.rest.length; i += 2) deformInto(rig, mesh.rest[i], mesh.rest[i + 1], p, slow, i);
        expect(Buffer.from(fast.buffer).equals(Buffer.from(slow.buffer))).toBe(true);
      }
    }
  });

  test("writes only the two slots it is given", () => {
    const out = new Float32Array([9, 9, 9, 9, 9, 9]);
    deformInto(rig, 40, 50, { ...restHead(), angleX: 12 }, out, 2);
    expect([out[0], out[1], out[4], out[5]]).toEqual([9, 9, 9, 9]);
    expect(out[2]).not.toBe(9);
  });
});

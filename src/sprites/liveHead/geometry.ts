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

export function eyeVertexY(eye: Eye, part: string, x: number, y: number, open: number, smile: number): number {
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

export function deformVertex(rig: Rig, x: number, y: number, p: HeadParameters): Point {
  const head = rig.head, body = rig.body, face = rig.face;
  const weight = (e: Ellipse) => gaussian(x, y, e);
  const ax = p.angleX / 30, ay = p.angleY / 30;
  let px = x, py = y;
  const brow = weight(face.brow) * (1 - smooth(...face.brow.band, y));
  py -= p.browY * 7 * brow;
  py += (x - face.brow.cx) * Math.sin(p.browAngle * 0.12 * brow);
  py += p.mouthOpen * 3.5 * weight(face.jaw) * smooth(...face.jaw.band, y);
  px += ax * (8 * weight(face.nose) + 5 * weight(face.mouth))
    + (x - face.eyeA.cx) * 0.12 * ax * weight(face.eyeA) - (x - face.eyeB.cx) * 0.12 * ax * weight(face.eyeB)
    - ax * 9 * weight(face.earR) + ax * 4 * weight(face.earL);
  py -= ay * (6 * weight(face.nose) + 3 * weight(face.mouth));
  py += (y - face.eyeA.cy) * -0.06 * Math.abs(ay) * weight(face.eyeA) + (y - face.eyeB.cy) * -0.06 * Math.abs(ay) * weight(face.eyeB);
  const bump = 1 - ((px - head.cx) / head.rx) ** 2 - ((py - head.cy) / head.ry) ** 2;
  const turn = smooth(0, 0.84, bump) * (1 - smooth(...head.turnBand, y));
  px += ax * head.shiftX * turn; py -= ay * head.shiftY * turn;
  const angle = -p.angleZ / 30 * head.maxRoll * (1 - smooth(...head.weightBand, y));
  const dx = px - head.pivotX, dy = py - head.pivotY;
  px = head.pivotX + dx * Math.cos(angle) - dy * Math.sin(angle);
  py = head.pivotY + dx * Math.sin(angle) + dy * Math.cos(angle);
  py -= p.breath * (5 * (1 - smooth(...body.breathBand, y)) + 4 * body.shoulders.reduce((sum, e) => sum + weight(e), 0));
  px += (px - body.chest.cx) * 0.012 * p.breath * weight(body.chest);
  return [px, py];
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

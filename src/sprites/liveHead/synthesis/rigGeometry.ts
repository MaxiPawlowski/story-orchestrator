import type { Band, Ellipse, Eye, Hand, Point, Rig, Strand } from "../types";
import { validateRig } from "../validate";
import { eyeCentre, type FaceLandmarks, type HandLandmarks } from "./landmarks";

export const EYE_SAMPLES = 24;
export const MAX_LAYER_VERTICES = 40_000;
export const LOWER_LID_OUTSET = 0.7;

const r2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const dist = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const ellipse = (cx: number, cy: number, rx: number, ry: number): Ellipse => ({ cx: r2(cx), cy: r2(cy), rx: r2(Math.max(1, rx)), ry: r2(Math.max(1, ry)) });
const band = (start: number, end: number): Band => {
  const a = r2(start), b = r2(Math.max(end, start + 1));
  return [a, b > a ? b : a + 1];
};

export function columnSpan(polygon: Point[], x: number): [number, number] {
  const ys: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[(i + 1) % polygon.length];
    if ((ax - x) * (bx - x) <= 0 && ax !== bx) ys.push(ay + (by - ay) * (x - ax) / (bx - ax));
  }
  if (ys.length < 2) throw new Error("An eye opening must enclose a vertical span at every sampled column.");
  return [Math.min(...ys), Math.max(...ys)];
}

export function eyeCurves(opening: Point[]): Pick<Eye, "x0" | "x1" | "top" | "bot"> {
  const xs = opening.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const top: number[] = [], bot: number[] = [];
  for (let i = 0; i < EYE_SAMPLES; i++) {
    const x = x0 + (x1 - x0) * clamp(i / (EYE_SAMPLES - 1), 0.002, 0.998);
    const [t, b] = columnSpan(opening, x);
    top.push(r2(t)); bot.push(r2(b));
  }
  for (const k of [0, EYE_SAMPLES - 1]) top[k] = bot[k] = r2((top[k] + bot[k]) / 2);
  return { x0: r2(x0), x1: r2(x1), top, bot };
}

export const layerVertices = (width: number, height: number, cell: number): number => (Math.ceil(width / cell) + 1) * (Math.ceil(height / cell) + 1);
export function fitCell(width: number, height: number, start: number): number {
  let cell = Math.max(2, Math.round(start));
  while (layerVertices(width, height, cell) > MAX_LAYER_VERTICES * 0.95) cell += 1;
  return cell;
}

export function eyeRoi(opening: Point[], pad: number, size: { width: number; height: number }): Point[] {
  const xs = opening.map((p) => p[0]), ys = opening.map((p) => p[1]);
  const x0 = clamp(Math.floor(Math.min(...xs) - pad), 0, size.width), x1 = clamp(Math.ceil(Math.max(...xs) + pad), 0, size.width);
  const y0 = clamp(Math.floor(Math.min(...ys) - pad), 0, size.height), y1 = clamp(Math.ceil(Math.max(...ys) + pad), 0, size.height);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export const STRAND_NODES = 4;

export function resampleStrand(points: Point[], count = STRAND_NODES): Point[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + dist(points[i - 1], points[i]));
  const total = lengths[lengths.length - 1], out: Point[] = [];
  for (let k = 0; k < count; k++) {
    const at = total * k / (count - 1);
    let i = 1;
    while (i < points.length - 1 && lengths[i] < at) i++;
    const span = lengths[i] - lengths[i - 1], u = span > 0 ? (at - lengths[i - 1]) / span : 0;
    out.push([r2(points[i - 1][0] + (points[i][0] - points[i - 1][0]) * u), r2(points[i - 1][1] + (points[i][1] - points[i - 1][1]) * u)]);
  }
  return out;
}

export function rigStrands(hair: Point[][], s: number): Strand[] {
  const strands: Strand[] = [];
  hair.forEach((points, index) => {
    const length = points.reduce((sum, p, i) => i ? sum + dist(points[i - 1], p) : 0, 0);
    if (length < s * 0.25) return;
    const nodes = resampleStrand(points), long = length > s * 1.5;
    if (nodes.some((p, i) => i > 0 && p[0] === nodes[i - 1][0] && p[1] === nodes[i - 1][1])) return;
    strands.push({ name: `hair${index + 1}`, nodes, sigma: r2(Math.max(3, s * (long ? 0.12 : 0.09))), k: long ? 0.6 : 1, max: r2(Math.max(1.5, s * (long ? 0.09 : 0.06))) });
  });
  return strands;
}

export function rigHand(hand: HandLandmarks, size: { width: number; height: number }): Hand | null {
  const { outline, wrist, knuckle, elbow } = hand;
  if (knuckle[1] >= wrist[1]) return null;
  const d = Math.max(4, dist(wrist, knuckle)), xs = outline.map((p) => p[0]);
  const contact = outline.reduce((best, p) => dist(p, wrist) > dist(best, wrist) ? p : best, outline[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), { width, height } = size;
  const pt = (p: Point): Point => [r2(p[0]), r2(p[1])];
  return {
    outline: outline.map(pt), jaw: [[r2(minX), r2(contact[1])], [r2(Math.max(maxX, minX + 1)), r2(contact[1])]], jawRange: band(minX, maxX), background: outline.map(pt),
    elbow: pt(elbow), wrist: pt(wrist), knuckle: pt(knuckle), contact: pt(contact), forearmShare: 0.3,
    armBand: band(height - d * 0.4, height + d * 0.4), wristBand: band(wrist[1] - d * 0.27, wrist[1] + d * 0.27), handBand: band(wrist[1] - d * 0.25, wrist[1] + d * 0.25),
    fingerXBand: contact[0] > knuckle[0] ? band(knuckle[0] - d * 0.075, knuckle[0] + d * 0.21) : band(width, width + 1),
    fingerYBand: band(knuckle[1] + d * 0.13, knuckle[1] + d * 0.35), pinBand: band(height - Math.max(4, d * 0.37), height),
  };
}

export function synthesizeRig(marks: FaceLandmarks): Rig {
  const { width, height } = marks.image, size = marks.image;
  const [ca, cb] = marks.eyes.map(eyeCentre), s = dist(ca, cb);
  const eyeY = (ca[1] + cb[1]) / 2, browY = (marks.brows[0][1] + marks.brows[1][1]) / 2, browX = (marks.brows[0][0] + marks.brows[1][0]) / 2;
  const m = marks.mouth, mouthCx = (m.left[0] + m.right[0]) / 2, mouthCy = (m.left[1] + m.right[1]) / 2;
  const angle = Math.atan2(m.right[1] - m.left[1], m.right[0] - m.left[0]), halfLen = Math.max(1, dist(m.left, m.right) / 2);
  const normal: Point = [-Math.sin(angle), Math.cos(angle)], lipMid: Point = [(m.top[0] + m.bottom[0]) / 2, (m.top[1] + m.bottom[1]) / 2];
  const bow = clamp((lipMid[0] - mouthCx) * normal[0] + (lipMid[1] - mouthCy) * normal[1], -halfLen / 2, halfLen / 2);
  const lipHeight = Math.max(2, dist(m.top, m.bottom));
  const pad = Math.max(2, Math.round(s * 0.08));
  const eyes = marks.eyes.map((contour): Eye => {
    const centreY = eyeCentre(contour)[1];
    const opening = contour.map((p): Point => [r2(p[0]), r2(Math.min(height, p[1] > centreY ? p[1] + LOWER_LID_OUTSET : p[1]))]);
    return { opening, roi: eyeRoi(opening, pad, size), ...eyeCurves(opening) };
  });
  const eyeEllipse = (eye: Eye, c: Point): Ellipse => {
    const ys = eye.opening.map((p) => p[1]);
    return ellipse(c[0], c[1], (eye.x1 - eye.x0) * 0.78, Math.max(s * 0.2, Math.max(...ys) - Math.min(...ys)));
  };
  const earY = (eyeY + marks.nose[1]) / 2;
  const ears: [Point, Point] = marks.ears ?? [[marks.face.cx - marks.face.rx * 0.97, earY], [marks.face.cx + marks.face.rx * 0.97, earY]];
  const chin = marks.chin, neck = marks.neck, [sl, sr] = marks.shoulders, shoulderY = (sl[1] + sr[1]) / 2, shoulderX = (sl[0] + sr[0]) / 2;
  const chinGap = Math.max(4, chin[1] - mouthCy), jawTop = mouthCy + Math.max(1, (chin[1] - mouthCy) * 0.1), jawBottom = Math.max(chin[1] + s * 0.05, jawTop + 2);
  const headBox = [marks.face.cx - marks.face.rx, marks.face.cy - marks.face.ry, marks.face.cx + marks.face.rx, marks.face.cy + marks.face.ry];
  const margin = s * 0.06;
  const fine = { x0: Math.round(clamp(headBox[0] - margin, 0, width - 1)), x1: Math.round(clamp(headBox[2] + margin, 1, width)),
    y0: Math.round(clamp(headBox[1] - margin, 0, height - 1)), y1: Math.round(clamp(Math.max(headBox[3], neck[1]) + margin, 1, height)) };
  if (fine.x1 <= fine.x0) fine.x1 = Math.min(width, fine.x0 + 1);
  if (fine.y1 <= fine.y0) fine.y1 = Math.min(height, fine.y0 + 1);
  const fineCell = fitCell(width, height, s / 9);
  const eyeCell = Math.max(...eyes.map((eye) => {
    const [[x0, y0], , [x1, y1]] = eye.roi;
    return fitCell(x1 - x0, y1 - y0, s / 12);
  }));
  const rig: Rig = {
    version: 1,
    image: { width, height },
    head: { ...ellipse(marks.face.cx, marks.face.cy, marks.face.rx, marks.face.ry), shiftX: r2(s * 0.14), shiftY: r2(s * 0.11),
      pivotX: r2(neck[0]), pivotY: r2(neck[1]), maxRoll: 0.15, weightBand: band(neck[1] - s * 0.28, neck[1] + s * 0.33), turnBand: band(neck[1] - s * 0.28, neck[1] + s * 0.44) },
    body: { pivotX: r2(neck[0]), pivotY: height, maxRoll: 0.035, breathBand: band(Math.min(neck[1] - s * 0.17, height - 2), height),
      rollBand: band(Math.min(neck[1] - s * 0.06, height - 1), height),
      chest: ellipse(marks.chest?.[0] ?? shoulderX, marks.chest?.[1] ?? shoulderY + s * 0.78, Math.abs(sr[0] - sl[0]) / 2 * 1.46, s * 1.33),
      shoulders: [ellipse(sl[0], sl[1], s * 0.42, s * 0.33), ellipse(sr[0], sr[1], s * 0.42, s * 0.33)] },
    face: {
      nose: ellipse(marks.nose[0], marks.nose[1], s * 0.17, s * 0.28),
      mouth: ellipse(mouthCx, mouthCy, halfLen * 1.25, Math.max(s * 0.17, lipHeight)),
      eyeA: eyeEllipse(eyes[0], ca), eyeB: eyeEllipse(eyes[1], cb),
      earL: ellipse(ears[0][0], ears[0][1], s * 0.11, s * 0.33), earR: ellipse(ears[1][0], ears[1][1], s * 0.11, s * 0.33),
      brow: { ...ellipse(browX, browY, s * 0.97, s * 0.28), band: band(browY, eyeY) },
      jaw: { ...ellipse(mouthCx, mouthCy + chinGap * 0.4, s * 0.7, chinGap * 0.45), band: band(jawTop, jawBottom) },
    },
    eyes,
    mouth: { cx: r2(mouthCx), cy: r2(mouthCy), angle: r2(angle), halfLen: r2(halfLen), bow: r2(bow),
      area: { ...ellipse(mouthCx, mouthCy, halfLen * 1.25, Math.max(halfLen, lipHeight)), angle: r2(angle) } },
    cheeks: [[r2(ca[0] - s * 0.17), r2(eyeY + (mouthCy - eyeY) * 0.72)], [r2(cb[0] + s * 0.17), r2(eyeY + (mouthCy - eyeY) * 0.72)]],
    mesh: { baseCell: fineCell * 2, fine: { ...fine, cell: fineCell }, handCell: fineCell * 2, tasselCell: fineCell * 2, eyeBallCell: eyeCell, eyeCell, spriteCell: eyeCell },
    view: { padTop: 0, padSide: 0 },
  };
  const strands = marks.hair ? rigStrands(marks.hair, s) : [], hand = marks.hand ? rigHand(marks.hand, size) : null;
  if (strands.length) rig.strands = strands;
  if (hand) rig.hand = hand;
  const problems = validateRig(rig);
  if (problems.length) throw new Error(`The synthesized rig is invalid:\n${problems.join("\n")}`);
  return rig;
}

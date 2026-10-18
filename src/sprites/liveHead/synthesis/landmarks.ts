import { isRecord } from "@utils/guards";
import type { Point } from "../types";

export const LANDMARK_VERSION = 1;
export interface FaceOval { cx: number; cy: number; rx: number; ry: number }
export interface FaceLandmarks {
  version: typeof LANDMARK_VERSION;
  image: { width: number; height: number };
  face: FaceOval;
  eyes: [Point[], Point[]];
  brows: [Point, Point];
  nose: Point;
  mouth: { left: Point; right: Point; top: Point; bottom: Point };
  chin: Point;
  neck: Point;
  shoulders: [Point, Point];
  ears?: [Point, Point];
  hair?: Point[][];
  chest?: Point;
  hand?: HandLandmarks;
}
export interface HandLandmarks { outline: Point[]; wrist: Point; knuckle: Point; elbow: Point }
export const MAX_HAIR_STRANDS = 10;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const pointIn = (size: { width: number; height: number }) => (value: unknown): value is Point =>
  Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1]) && value[0] >= 0 && value[1] >= 0 && value[0] <= size.width && value[1] <= size.height;
const area = (points: Point[]): number => Math.abs(points.reduce((sum, [x, y], i) => {
  const [nx, ny] = points[(i + 1) % points.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;
const centre = (points: Point[]): Point => [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
const copy = (point: Point): Point => [point[0], point[1]];
const shaped = (_value: unknown, problems: string[]): _value is FaceLandmarks => problems.length === 0;

export function landmarkProblems(value: unknown, size: { width: number; height: number }): string[] {
  const problems: string[] = [];
  if (!isRecord(value)) return ["landmarks: expected an object"];
  if (value.version !== LANDMARK_VERSION) problems.push("landmarks.version: only version 1 is supported");
  if (!isRecord(value.image) || value.image.width !== size.width || value.image.height !== size.height) problems.push("landmarks.image: must match the bust size");
  const point = pointIn(size);
  const face = value.face;
  if (!isRecord(face) || ![face.cx, face.cy, face.rx, face.ry].every(finite) || Number(face.rx) <= 0 || Number(face.ry) <= 0) problems.push("landmarks.face: expected an oval with positive radii");
  if (!Array.isArray(value.eyes) || value.eyes.length !== 2) problems.push("landmarks.eyes: expected two eye contours");
  else value.eyes.forEach((eye: unknown, index: number) => {
    if (!Array.isArray(eye) || eye.length < 4 || eye.length > 64 || !eye.every(point)) problems.push(`landmarks.eyes[${index}]: expected 4..64 points inside the bust`);
    else if (area(eye as Point[]) < 4) problems.push(`landmarks.eyes[${index}]: the eye opening has no area`);
  });
  for (const key of ["brows", "shoulders", "ears"] as const) {
    const pair = value[key];
    if (key === "ears" && pair === undefined) continue;
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(point)) problems.push(`landmarks.${key}: expected two points inside the bust`);
  }
  for (const key of ["nose", "chin", "neck"] as const) if (!point(value[key])) problems.push(`landmarks.${key}: expected a point inside the bust`);
  const mouth = value.mouth;
  if (!isRecord(mouth) || !["left", "right", "top", "bottom"].every((key) => point(mouth[key]))) problems.push("landmarks.mouth: expected left, right, top and bottom points");
  if (!shaped(value, problems)) return problems;
  const marks = value;
  const [a, b] = marks.eyes.map(centre);
  if (a[0] >= b[0]) problems.push("landmarks.eyes: list the eye on the image's left first");
  if (Math.abs(b[0] - a[0]) < 6) problems.push("landmarks.eyes: the eyes are too close to rig");
  if (marks.brows[0][0] >= marks.brows[1][0]) problems.push("landmarks.brows: list the image's left brow first");
  if (marks.shoulders[0][0] >= marks.shoulders[1][0]) problems.push("landmarks.shoulders: list the image's left shoulder first");
  if (marks.mouth.left[0] >= marks.mouth.right[0]) problems.push("landmarks.mouth: left corner must be left of the right corner");
  if (marks.mouth.top[1] > marks.mouth.bottom[1]) problems.push("landmarks.mouth: top lip must not be below the bottom lip");
  const eyeY = (a[1] + b[1]) / 2, mouthY = (marks.mouth.left[1] + marks.mouth.right[1]) / 2;
  if (!(Math.max(marks.brows[0][1], marks.brows[1][1]) < eyeY && eyeY < marks.nose[1] && marks.nose[1] < mouthY && mouthY < marks.chin[1] && marks.chin[1] <= marks.neck[1]))
    problems.push("landmarks: expected brows, eyes, nose, mouth, chin and neck from top to bottom");
  if (Math.min(marks.shoulders[0][1], marks.shoulders[1][1]) < marks.chin[1]) problems.push("landmarks.shoulders: shoulders must sit below the chin");
  if (marks.eyes.some((eye) => eye.some(([x, y]) => ((x - marks.face.cx) / marks.face.rx) ** 2 + ((y - marks.face.cy) / marks.face.ry) ** 2 > 1)))
    problems.push("landmarks.face: both eyes must lie inside the face oval");
  return problems;
}

export function optionalLandmarkNotes(value: unknown, size: { width: number; height: number }): string[] {
  if (!isRecord(value)) return [];
  const point = pointIn(size), notes: string[] = [];
  const hair = value.hair;
  if (hair !== undefined) {
    if (!Array.isArray(hair) || hair.length > MAX_HAIR_STRANDS) notes.push(`landmarks.hair: expected up to ${MAX_HAIR_STRANDS} strands; hair left still`);
    else hair.forEach((strand: unknown, index: number) => {
      if (!Array.isArray(strand) || strand.length < 2 || strand.length > 6 || !strand.every(point)) notes.push(`landmarks.hair[${index}]: expected 2..6 points inside the bust; strand dropped`);
      else if ((strand as Point[]).some((p, j) => j > 0 && Math.hypot(p[0] - strand[j - 1][0], p[1] - strand[j - 1][1]) < 1)) notes.push(`landmarks.hair[${index}]: repeated points; strand dropped`);
    });
  }
  if (value.chest !== undefined && !point(value.chest)) notes.push("landmarks.chest: expected a point inside the bust; chest estimated from the shoulders");
  const hand = value.hand;
  if (hand !== undefined) {
    const anywhere = (p: unknown): boolean => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
    if (!isRecord(hand) || !Array.isArray(hand.outline) || hand.outline.length < 3 || hand.outline.length > 64 || !hand.outline.every(point)
      || area(hand.outline as Point[]) < 16 || !point(hand.wrist) || !point(hand.knuckle) || !anywhere(hand.elbow))
      notes.push("landmarks.hand: expected an outline, wrist and knuckle inside the bust and an elbow; hand left still");
  }
  return notes;
}

function optionalGroups(value: Record<string, unknown>, size: { width: number; height: number }): Pick<FaceLandmarks, "hair" | "chest" | "hand"> {
  const notes = optionalLandmarkNotes(value, size), out: Pick<FaceLandmarks, "hair" | "chest" | "hand"> = {};
  const noted = (prefix: string) => notes.some((note) => note.startsWith(prefix));
  if (Array.isArray(value.hair) && !noted("landmarks.hair:")) {
    const hair = (value.hair as Point[][]).filter((_, index) => !noted(`landmarks.hair[${index}]`)).map((strand) => strand.map(copy));
    if (hair.length) out.hair = hair;
  }
  if (value.chest !== undefined && !noted("landmarks.chest")) out.chest = copy(value.chest as Point);
  if (value.hand !== undefined && !noted("landmarks.hand")) {
    const hand = value.hand as HandLandmarks;
    out.hand = { outline: hand.outline.map(copy), wrist: copy(hand.wrist), knuckle: copy(hand.knuckle), elbow: copy(hand.elbow) };
  }
  return out;
}

export function parseLandmarks(value: unknown, size: { width: number; height: number }): FaceLandmarks {
  const problems = landmarkProblems(value, size);
  if (problems.length) throw new Error(`These face landmarks cannot be rigged:\n${problems.join("\n")}`);
  const marks = value as FaceLandmarks;
  return { version: LANDMARK_VERSION, image: { width: size.width, height: size.height }, face: { cx: marks.face.cx, cy: marks.face.cy, rx: marks.face.rx, ry: marks.face.ry },
    eyes: [marks.eyes[0].map(copy), marks.eyes[1].map(copy)], brows: [copy(marks.brows[0]), copy(marks.brows[1])], nose: copy(marks.nose),
    mouth: { left: copy(marks.mouth.left), right: copy(marks.mouth.right), top: copy(marks.mouth.top), bottom: copy(marks.mouth.bottom) },
    chin: copy(marks.chin), neck: copy(marks.neck), shoulders: [copy(marks.shoulders[0]), copy(marks.shoulders[1])],
    ...(marks.ears ? { ears: [copy(marks.ears[0]), copy(marks.ears[1])] as [Point, Point] } : {}), ...optionalGroups(value as Record<string, unknown>, size) };
}

export const eyeCentre = centre;

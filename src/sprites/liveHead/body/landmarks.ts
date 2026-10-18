import { isRecord } from "@utils/guards";
import type { Point } from "../types";
import type { ArmState, BodyPose } from "./types";

export const MAX_BODY_STRANDS = 10;
export interface ArmLandmarks { side: "left" | "right"; state: ArmState; shoulder: Point; elbow: Point; wrist: Point; outline: Point[] }
export interface BodyLandmarks {
  version: 1;
  kind: "body";
  image: { width: number; height: number };
  pose: BodyPose;
  head: { cx: number; cy: number; rx: number; ry: number };
  neck: Point;
  shoulders: [Point, Point];
  chest: Point;
  waist: Point;
  hips: [Point, Point];
  eyes?: [Point, Point];
  arms?: ArmLandmarks[];
  hair?: Point[][];
}
export interface ParsedBody { marks: BodyLandmarks; notes: string[] }

type Size = { width: number; height: number };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const pointIn = (size: Size) => (value: unknown): value is Point =>
  Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1]) && value[0] >= 0 && value[1] >= 0 && value[0] <= size.width && value[1] <= size.height;
const copy = (p: Point): Point => [p[0], p[1]];
const area = (points: Point[]): number => Math.abs(points.reduce((sum, [x, y], i) => {
  const [nx, ny] = points[(i + 1) % points.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;
const far = (a: Point, b: Point, d = 2): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) >= d;

export function bodyLandmarkProblems(value: unknown, size: Size): string[] {
  if (!isRecord(value)) return ["landmarks: expected an object"];
  const problems: string[] = [], point = pointIn(size);
  if (value.version !== 1) problems.push("landmarks.version: only version 1 is supported");
  if (value.kind !== "body") problems.push("landmarks.kind: expected \"body\"");
  if (!isRecord(value.image) || value.image.width !== size.width || value.image.height !== size.height) problems.push("landmarks.image: must match the sprite size");
  if (value.pose !== "standing" && value.pose !== "sitting" && value.pose !== "other") problems.push("landmarks.pose: expected standing, sitting or other");
  const head = value.head;
  if (!isRecord(head) || ![head.cx, head.cy, head.rx, head.ry].every(finite) || Number(head.rx) <= 0 || Number(head.ry) <= 0 || !point([head.cx, head.cy]))
    problems.push("landmarks.head: expected an oval with positive radii centred inside the sprite");
  for (const key of ["neck", "chest", "waist"] as const) if (!point(value[key])) problems.push(`landmarks.${key}: expected a point inside the sprite`);
  for (const key of ["shoulders", "hips"] as const) {
    const pair = value[key];
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(point)) problems.push(`landmarks.${key}: expected two points inside the sprite`);
    else if ((pair as Point[])[0][0] >= (pair as Point[])[1][0]) problems.push(`landmarks.${key}: list the image's left one first`);
  }
  if (problems.length) return problems;
  const headY = Number((head as Record<string, number>).cy), neck = value.neck as Point, chest = value.chest as Point, waist = value.waist as Point;
  const shoulders = value.shoulders as Point[], hips = value.hips as Point[], hipY = (hips[0][1] + hips[1][1]) / 2;
  if (!(headY < neck[1] && neck[1] < chest[1] && chest[1] < waist[1] && waist[1] < hipY)) problems.push("landmarks: expected head, neck, chest, waist and hips from top to bottom");
  if (shoulders.some((s) => s[1] <= headY || s[1] >= waist[1])) problems.push("landmarks.shoulders: shoulders must sit between the head centre and the waist");
  return problems;
}

function armProblem(arm: unknown, size: Size): string | null {
  const point = pointIn(size);
  if (!isRecord(arm)) return "expected an object";
  if (arm.side !== "left" && arm.side !== "right") return "side must be left or right";
  if (arm.state !== "free" && arm.state !== "resting" && arm.state !== "holding") return "state must be free, resting or holding";
  if (!point(arm.shoulder) || !point(arm.elbow) || !point(arm.wrist)) return "shoulder, elbow and wrist must lie inside the sprite";
  if (!far(arm.shoulder as Point, arm.elbow as Point) || !far(arm.elbow as Point, arm.wrist as Point)) return "shoulder, elbow and wrist must differ";
  if (!Array.isArray(arm.outline) || arm.outline.length < 4 || arm.outline.length > 64 || !arm.outline.every(point)) return "outline must be 4..64 points inside the sprite";
  if (area(arm.outline as Point[]) < 16) return "outline has no area";
  return null;
}

export function parseBodyLandmarks(value: unknown, size: Size): ParsedBody {
  const problems = bodyLandmarkProblems(value, size);
  if (problems.length) throw new Error(`These body landmarks cannot be rigged:\n${problems.join("\n")}`);
  const raw = value as Record<string, unknown> & BodyLandmarks, notes: string[] = [], point = pointIn(size);
  const marks: BodyLandmarks = { version: 1, kind: "body", image: { width: size.width, height: size.height }, pose: raw.pose,
    head: { cx: raw.head.cx, cy: raw.head.cy, rx: raw.head.rx, ry: raw.head.ry }, neck: copy(raw.neck), shoulders: [copy(raw.shoulders[0]), copy(raw.shoulders[1])],
    chest: copy(raw.chest), waist: copy(raw.waist), hips: [copy(raw.hips[0]), copy(raw.hips[1])] };
  if (raw.eyes !== undefined) {
    const eyes = raw.eyes as unknown;
    if (Array.isArray(eyes) && eyes.length === 2 && eyes.every(point) && eyes[0][0] < eyes[1][0]) marks.eyes = [copy(eyes[0]), copy(eyes[1])];
    else notes.push("landmarks.eyes: expected two eye centres, image-left first; hair near the eyes is not cut");
  }
  if (raw.arms !== undefined) {
    const arms = raw.arms as unknown;
    if (!Array.isArray(arms) || arms.length > 2) notes.push("landmarks.arms: expected up to two arms; arms move with the torso");
    else {
      const kept: ArmLandmarks[] = [];
      arms.forEach((arm: unknown, index: number) => {
        const problem = armProblem(arm, size);
        if (problem) { notes.push(`landmarks.arms[${index}]: ${problem}; arm moves with the torso`); return; }
        const a = arm as ArmLandmarks;
        if (kept.some((other) => other.side === a.side)) { notes.push(`landmarks.arms[${index}]: a second ${a.side} arm; arm moves with the torso`); return; }
        kept.push({ side: a.side, state: a.state, shoulder: copy(a.shoulder), elbow: copy(a.elbow), wrist: copy(a.wrist), outline: a.outline.map(copy) });
      });
      if (kept.length) marks.arms = kept;
    }
  }
  if (raw.hair !== undefined) {
    const hair = raw.hair as unknown;
    if (!Array.isArray(hair) || hair.length > MAX_BODY_STRANDS) notes.push(`landmarks.hair: expected up to ${MAX_BODY_STRANDS} locks; hair left still`);
    else {
      const kept: Point[][] = [];
      hair.forEach((strand: unknown, index: number) => {
        if (!Array.isArray(strand) || strand.length < 2 || strand.length > 6 || !strand.every(point)) notes.push(`landmarks.hair[${index}]: expected 2..6 points inside the sprite; lock dropped`);
        else if ((strand as Point[]).some((p, j) => j > 0 && !far(p, strand[j - 1], 1))) notes.push(`landmarks.hair[${index}]: repeated points; lock dropped`);
        else kept.push((strand as Point[]).map(copy));
      });
      if (kept.length) marks.hair = kept;
    }
  }
  return { marks, notes };
}

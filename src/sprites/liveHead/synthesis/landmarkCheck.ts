import { isRecord } from "@utils/guards";
import type { Point } from "../types";
import { eyeCentre, type FaceLandmarks } from "./landmarks";

export const DETECTOR_POINTS = 28;
export const CROSS_CHECK_LIMITS = Object.freeze({
  minFaceWidth: 8,
  minBoxScore: 0.5,
  minPointScore: 0.3,
  eyeShift: 0.15,
  mouthShift: 0.15,
  chinShift: 0.15,
  jawRatio: [0.6, 1.6] as const,
});

export type DetectorPoint = [number, number, number];
export interface DetectorFace { box: [number, number, number, number, number]; points: DetectorPoint[] }
export interface DetectorResult { width: number; height: number; faces: DetectorFace[] }
export type CrossCheckFeature = "face" | "eyes" | "mouth" | "jaw";
export interface CrossCheckWarning { feature: CrossCheckFeature; message: string; faceWidths: number }
export type LandmarkCrossCheck =
  | { status: "agree"; note: string }
  | { status: "disagree"; warnings: CrossCheckWarning[]; note: string }
  | { status: "skipped"; note: string };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const triple = (value: unknown): value is DetectorPoint => Array.isArray(value) && value.length === 3 && value.every(finite);

export function readDetectorResult(value: unknown): DetectorResult | null {
  if (!isRecord(value) || !finite(value.width) || !finite(value.height) || !Array.isArray(value.faces)) return null;
  const faces: DetectorFace[] = [];
  for (const face of value.faces) {
    if (!isRecord(face) || !Array.isArray(face.box) || face.box.length !== 5 || !face.box.every(finite)) return null;
    if (!Array.isArray(face.points) || face.points.length !== DETECTOR_POINTS || !face.points.every(triple)) return null;
    faces.push({ box: [face.box[0], face.box[1], face.box[2], face.box[3], face.box[4]], points: face.points.map(([x, y, s]) => [x, y, s]) });
  }
  return { width: value.width, height: value.height, faces };
}

const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mean = (points: Point[]): Point => eyeCentre(points);
const xy = (point: DetectorPoint): Point => [point[0], point[1]];
const pick = (face: DetectorFace, indexes: number[]): DetectorPoint[] => indexes.map((index) => face.points[index]);
const scored = (points: DetectorPoint[]): boolean => points.reduce((sum, point) => sum + point[2], 0) / points.length >= CROSS_CHECK_LIMITS.minPointScore;
const round = (value: number): number => Math.round(value * 100) / 100;

const DETECTOR_LEFT_EYE = [11, 12, 13, 14, 15, 16];
const DETECTOR_RIGHT_EYE = [17, 18, 19, 20, 21, 22];
const DETECTOR_MOUTH = [24, 25, 26, 27];
const DETECTOR_JAW = [0, 2, 4];

function nearestFace(faces: DetectorFace[], centre: Point): DetectorFace | undefined {
  const boxCentre = (face: DetectorFace): Point => [(face.box[0] + face.box[2]) / 2, (face.box[1] + face.box[3]) / 2];
  return faces.filter((face) => face.box[4] >= CROSS_CHECK_LIMITS.minBoxScore)
    .reduce<DetectorFace | undefined>((best, face) => !best || distance(boxCentre(face), centre) < distance(boxCentre(best), centre) ? face : best, undefined);
}

export function crossCheckLandmarks(marks: FaceLandmarks, detected: DetectorResult): LandmarkCrossCheck {
  const skip = (why: string): LandmarkCrossCheck => ({ status: "skipped", note: `${why}; landmarks were not cross-checked.` });
  if (detected.width !== marks.image.width || detected.height !== marks.image.height) return skip("The face detector read a different image size");
  const centre: Point = [marks.face.cx, marks.face.cy];
  const face = nearestFace(detected.faces, centre);
  if (!face) return skip("The face detector found no face in this bust");
  const width = distance(xy(face.points[0]), xy(face.points[4]));
  if (width < CROSS_CHECK_LIMITS.minFaceWidth) return skip("The detected face is too small to compare");
  const warnings: CrossCheckWarning[] = [], skipped: string[] = [];
  const warn = (feature: CrossCheckFeature, message: string, faceWidths: number) => warnings.push({ feature, message, faceWidths: round(faceWidths) });
  const [x0, y0, x1, y1] = face.box;
  if (centre[0] < x0 || centre[0] > x1 || centre[1] < y0 || centre[1] > y1)
    warn("face", "The vision model's face oval is centred outside the face the detector found.", distance(centre, [(x0 + x1) / 2, (y0 + y1) / 2]) / width);
  const leftEye = pick(face, DETECTOR_LEFT_EYE), rightEye = pick(face, DETECTOR_RIGHT_EYE);
  if (scored(leftEye) && scored(rightEye)) {
    const ours = marks.eyes.map(mean), theirs = [mean(leftEye.map(xy)), mean(rightEye.map(xy))];
    const straight = [distance(ours[0], theirs[0]), distance(ours[1], theirs[1])];
    const crossed = [distance(ours[0], theirs[1]), distance(ours[1], theirs[0])];
    const limit = CROSS_CHECK_LIMITS.eyeShift * width;
    if (Math.max(...straight) > limit && Math.max(...crossed) <= limit)
      warn("eyes", "The eyes look swapped: each one sits where the detector found the other eye.", Math.max(...straight) / width);
    else straight.forEach((shift, index) => {
      if (shift > limit) warn("eyes", `The ${index === 0 ? "image-left" : "image-right"} eye is ${round(shift / width)} face widths from the detector's eye.`, shift / width);
    });
  } else skipped.push("eyes");
  const mouth = pick(face, DETECTOR_MOUTH);
  if (scored(mouth)) {
    const shift = distance(mean([marks.mouth.left, marks.mouth.right, marks.mouth.top, marks.mouth.bottom]), mean(mouth.map(xy))) / width;
    if (shift > CROSS_CHECK_LIMITS.mouthShift) warn("mouth", `The mouth is ${round(shift)} face widths from the detector's mouth.`, shift);
  } else skipped.push("mouth");
  if (scored(pick(face, DETECTOR_JAW))) {
    const shift = distance(marks.chin, xy(face.points[2])) / width, ratio = (2 * marks.face.rx) / width;
    if (shift > CROSS_CHECK_LIMITS.chinShift) warn("jaw", `The chin is ${round(shift)} face widths from the detector's chin.`, shift);
    const [low, high] = CROSS_CHECK_LIMITS.jawRatio;
    if (ratio < low || ratio > high) warn("jaw", `The face oval is ${round(ratio)} times the width of the detector's jaw.`, Math.abs(ratio - 1));
  } else skipped.push("jaw");
  const unsure = skipped.length ? ` The detector was unsure of: ${skipped.join(", ")}.` : "";
  if (warnings.length) return { status: "disagree", warnings, note: `The face detector disagrees with the vision model's landmarks. Check the preview before accepting.${unsure}` };
  if (skipped.length === 3) return skip("The face detector was unsure of every feature");
  return { status: "agree", note: `The face detector agrees with the vision model's landmarks.${unsure}` };
}

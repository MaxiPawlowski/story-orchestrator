import type { Point } from "../liveHead/types";
import { LANDMARK_VERSION, type FaceLandmarks } from "../liveHead/synthesis/landmarks";
import type { DetectorFace } from "../liveHead/synthesis/landmarkCheck";

export const SURE_SCORE = 0.5;
const xy = (face: DetectorFace, index: number): Point => [face.points[index][0], face.points[index][1]];
const sure = (face: DetectorFace, indices: number[]): boolean => indices.every((index) => face.points[index][2] >= SURE_SCORE);
const mean = (points: Point[]): Point => [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length];
const clampPoint = (point: Point, size: { width: number; height: number }): Point =>
  [Math.min(size.width - 1, Math.max(0, point[0])), Math.min(size.height - 1, Math.max(0, point[1]))];

export function eyeOpening(points: Point[], minHeight: number): Point[] {
  const centre = mean(points);
  const ordered = [...points].sort((a, b) => Math.atan2(a[1] - centre[1], a[0] - centre[0]) - Math.atan2(b[1] - centre[1], b[0] - centre[0]));
  const ys = ordered.map((p) => p[1]), height = Math.max(...ys) - Math.min(...ys);
  if (height >= minHeight) return ordered;
  const stretch = minHeight / Math.max(1, height);
  return ordered.map(([x, y]): Point => [x, centre[1] + (y - centre[1]) * stretch]);
}

export function detectorLandmarks(face: DetectorFace, size: { width: number; height: number }): FaceLandmarks {
  const contour = [0, 1, 2, 3, 4].map((index) => xy(face, index));
  const left = contour[0], right = contour[4], chin = xy(face, 2);
  const faceWidth = right[0] - left[0];
  const eyeL = eyeOpening([11, 12, 13, 14, 15, 16].map((index) => xy(face, index)), faceWidth * 0.08);
  const eyeR = eyeOpening([17, 18, 19, 20, 21, 22].map((index) => xy(face, index)), faceWidth * 0.08);
  const eyeTop = Math.min(...eyeL.map((p) => p[1]), ...eyeR.map((p) => p[1])), eyeY = (mean(eyeL)[1] + mean(eyeR)[1]) / 2;
  const browsSure = sure(face, [5, 6, 7, 8, 9, 10]);
  const browL: Point = browsSure ? xy(face, 6) : [mean(eyeL)[0], eyeTop - faceWidth * 0.08], browR: Point = browsSure ? xy(face, 9) : [mean(eyeR)[0], eyeTop - faceWidth * 0.08];
  const nose: Point = sure(face, [23]) ? xy(face, 23) : [(left[0] + right[0]) / 2, eyeY + (chin[1] - eyeY) * 0.45];
  const mouthAt = nose[1] + (chin[1] - nose[1]) * 0.42;
  const mouthPoints = sure(face, [24, 25, 26, 27]) ? [24, 25, 26, 27].map((index) => xy(face, index))
    : [[nose[0] - faceWidth * 0.1, mouthAt], [nose[0], mouthAt - 1], [nose[0] + faceWidth * 0.1, mouthAt], [nose[0], mouthAt + 1]] as Point[];
  const mouthCentre = mean(mouthPoints);
  const mouthHalf = Math.max(faceWidth * 0.08, (Math.max(...mouthPoints.map((p) => p[0])) - Math.min(...mouthPoints.map((p) => p[0]))) / 2);
  const mouthOpen = Math.max(faceWidth * 0.02, (Math.max(...mouthPoints.map((p) => p[1])) - Math.min(...mouthPoints.map((p) => p[1]))) / 2);
  const browY = Math.min(browL[1], browR[1]);
  const top = browY - (chin[1] - browY) * 0.45;
  const cx = (left[0] + right[0]) / 2;
  const faceHeight = chin[1] - top;
  const neck = clampPoint([cx, chin[1] + faceHeight * 0.22], size);
  const shoulderY = chin[1] + faceHeight * 0.55;
  return {
    version: LANDMARK_VERSION,
    image: { width: size.width, height: size.height },
    face: { cx, cy: (top + chin[1]) / 2, rx: faceWidth / 2 * 1.04, ry: faceHeight / 2 * 1.02 },
    eyes: [eyeL, eyeR],
    brows: [browL, browR],
    nose: [nose[0], Math.max(nose[1], (mean(eyeL)[1] + mean(eyeR)[1]) / 2 + 1)],
    mouth: {
      left: [mouthCentre[0] - mouthHalf, mouthCentre[1]], right: [mouthCentre[0] + mouthHalf, mouthCentre[1]],
      top: [mouthCentre[0], mouthCentre[1] - mouthOpen], bottom: [mouthCentre[0], mouthCentre[1] + mouthOpen],
    },
    chin,
    neck,
    shoulders: [clampPoint([cx - faceWidth * 1.15, shoulderY], size), clampPoint([cx + faceWidth * 1.15, shoulderY], size)],
  };
}

import { landmarkProblems } from "../liveHead/synthesis/landmarks";
import { synthesizeRig } from "../liveHead/synthesis/rigGeometry";
import type { DetectorFace } from "../liveHead/synthesis/landmarkCheck";
import { detectorLandmarks, eyeOpening } from "./detectorLandmarks";

const face: DetectorFace = {
  box: [180, 60, 340, 250, 0.99],
  points: [
    [188, 140, 0.9], [200, 205, 0.9], [258, 240, 0.9], [318, 205, 0.9], [330, 140, 0.9],
    [205, 118, 0.9], [222, 112, 0.9], [240, 116, 0.9], [276, 116, 0.9], [294, 112, 0.9], [311, 118, 0.9],
    [210, 140, 0.9], [222, 132, 0.9], [236, 133, 0.9], [244, 142, 0.9], [232, 150, 0.9], [218, 149, 0.9],
    [272, 142, 0.9], [280, 133, 0.9], [294, 132, 0.9], [306, 140, 0.9], [298, 149, 0.9], [284, 150, 0.9],
    [258, 180, 0.9], [244, 208, 0.9], [258, 204, 0.9], [272, 208, 0.9], [258, 212, 0.9],
  ],
};
const size = { width: 512, height: 512 };

describe("detector landmarks for the showcase rigs", () => {
  test("converts the 28 detector points into landmarks the rig accepts", () => {
    const marks = detectorLandmarks(face, size);
    expect(landmarkProblems(marks, size)).toEqual([]);
    expect(() => synthesizeRig(marks)).not.toThrow();
  });

  test("lists the image-left eye first and keeps both inside the face", () => {
    const marks = detectorLandmarks(face, size);
    expect(Math.max(...marks.eyes[0].map(([x]) => x))).toBeLessThan(Math.min(...marks.eyes[1].map(([x]) => x)));
    expect(marks.shoulders.every(([, y]) => y > marks.chin[1])).toBe(true);
  });

  test("places brows and mouth from the eyes and chin when the detector is unsure of them", () => {
    const unsure: DetectorFace = { ...face, points: face.points.map((point, index) => [5, 6, 7, 8, 9, 10, 24, 25, 26, 27].includes(index) ? [point[0], point[1] - 40, 0.2] : point) };
    const marks = detectorLandmarks(unsure, size), sureMarks = detectorLandmarks(face, size);
    expect(Math.abs(marks.brows[0][1] - sureMarks.brows[0][1])).toBeLessThan(20);
    expect(marks.mouth.left[1]).toBeGreaterThan(marks.nose[1]);
    expect(landmarkProblems(marks, size)).toEqual([]);
  });

  test("opens a squinting eye to a riggable height", () => {
    const flat = eyeOpening([[0, 10], [10, 9], [20, 10], [20, 11], [10, 11], [0, 11]], 6);
    const ys = flat.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(5.99);
  });
});

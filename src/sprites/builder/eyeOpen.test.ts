import { blinkProblems, eyeBoxes, eyesSeen, eyeWhites, overBase, BLINK_OPEN_LIMIT, EYE_SEEN_SCORE } from "./eyeOpen";
import type { PixelImage } from "./pixels";

const face = (whites: Array<[number, number]>): PixelImage => {
  const width = 40, height = 20, data = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < width * height; at++) data.set([230, 180, 150, 255], at * 4);
  for (const [x0, x1] of whites) for (let y = 8; y < 12; y++) for (let x = x0; x < x1; x++) data.set([245, 245, 248, 255], (y * width + x) * 4);
  return { width, height, data };
};
const eyes = [{ x: 4, y: 6, width: 12, height: 8 }, { x: 24, y: 6, width: 12, height: 8 }];

test("eye whites count pale, low-colour pixels only; skin does not count", () => {
  expect(eyeWhites(face([[6, 14]]), eyes[0])).toBe(32);
  expect(eyeWhites(face([]), eyes[0])).toBe(0);
});

test("a blink must close both eyes: a frame that leaves one eye's white showing is refused, a real blink passes", () => {
  const base = face([[6, 14], [26, 34]]);
  expect(blinkProblems(base, face([]), eyes)).toEqual([]);
  expect(blinkProblems(base, face([[26, 34]]), eyes)).toEqual([`The blink leaves the second eye open (100% of its white still shows).`]);
  expect(blinkProblems(base, face([[6, 8], [26, 34]]), eyes)).toHaveLength(1);
  expect(2 * 4 / 32).toBeLessThanOrEqual(BLINK_OPEN_LIMIT);
});

test("eyes too small to judge are skipped, and a frame overlay is read on top of the base", () => {
  expect(blinkProblems(face([[6, 7]]), face([[6, 7]]), eyes)).toEqual([]);
  const base = face([[6, 14], [26, 34]]), overlay: PixelImage = { width: 40, height: 20, data: new Uint8ClampedArray(40 * 20 * 4) };
  for (let y = 8; y < 12; y++) for (let x = 6; x < 14; x++) overlay.data.set([200, 150, 120, 255], (y * 40 + x) * 4);
  expect(blinkProblems(base, overBase(base, overlay), eyes)).toEqual([`The blink leaves the second eye open (100% of its white still shows).`]);
});

test("detector points 11-16 and 17-22 become eye boxes scaled to the image; low-score points give no boxes", () => {
  const points = Array.from({ length: 28 }, (_, at): [number, number, number] => at >= 11 && at <= 16 ? [10 + (at - 11) * 2, 20 + (at % 2), 0.9] : at >= 17 && at <= 22 ? [40 + (at - 17) * 2, 20 + (at % 2), 0.9] : [0, 0, 0.9]);
  const result = { width: 100, height: 100, faces: [{ box: [0, 0, 80, 80, 0.95], points }] };
  expect(eyeBoxes(result, { width: 200, height: 200 })).toEqual([{ x: 20, y: 37, width: 20, height: 8 }, { x: 80, y: 37, width: 20, height: 8 }]);
  expect(eyeBoxes({ ...result, faces: [{ ...result.faces[0], points: points.map((p, at) => at === 12 ? [p[0], p[1], 0.1] : p) }] }, { width: 200, height: 200 })).toBeNull();
  expect(eyeBoxes({ width: 100, height: 100, faces: [] }, { width: 100, height: 100 })).toBeNull();
});

test("an eye the detector no longer sees confidently is closed even when pale pixels remain (hair over the eye)", () => {
  const base = face([[6, 14], [26, 34]]);
  expect(blinkProblems(base, base, eyes, [false, true])).toEqual([`The blink leaves the second eye open (100% of its white still shows).`]);
  expect(blinkProblems(base, base, eyes, [false, false])).toEqual([]);
  const points = (score: number) => Array.from({ length: 28 }, (_, at): [number, number, number] => [at, at, at >= 11 && at <= 16 ? score : 0.9]);
  const result = (score: number) => ({ width: 100, height: 100, faces: [{ box: [0, 0, 80, 80, 0.95], points: points(score) }] });
  expect(eyesSeen(result(0.9))).toEqual([true, true]);
  expect(eyesSeen(result(EYE_SEEN_SCORE - 0.01))).toEqual([false, true]);
  expect(eyesSeen({ width: 100, height: 100, faces: [] })).toEqual([false, false]);
});

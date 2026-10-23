import { blinkProblems, eyeBoxes, eyeOpenness, eyeWhites, overBase, stillOpen, BLINK_OPEN_LIMIT, EYE_CLOSED_LIMIT } from "./eyeOpen";
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

test("a lid the detector reads as closed outranks pale pixels left in the eye box (hair over the eye)", () => {
  const base = face([[6, 14], [26, 34]]);
  expect(blinkProblems(base, base, eyes, [false, true])).toEqual([`The blink leaves the second eye open (100% of its white still shows).`]);
  expect(blinkProblems(base, base, eyes, [false, false])).toEqual([]);
  expect(stillOpen([0.8, 0.42], [0.16, 0.2])).toEqual([false, false]);
  expect(stillOpen([0.8, 0.42], [0.79, 0.43])).toEqual([true, true]);
  expect(stillOpen([0.8, 0.42], [0.5, EYE_CLOSED_LIMIT])).toEqual([true, false]);
  expect(stillOpen(null, [0.1, 0.1])).toBeUndefined();
});

test("eye openness is lid height over eye width from points 11-16 and 17-22; a weak point gives no reading", () => {
  const points = (lid: number, score = 0.9) => Array.from({ length: 28 }, (_, at): [number, number, number] =>
    at >= 11 && at <= 22 ? [(at - 11) % 6 < 3 ? ((at - 11) % 3) * 10 : ((at - 11) % 3) * 10, (at - 11) % 6 < 3 ? 0 : lid, score] : [0, 0, 0.9]);
  const result = (lid: number, score?: number) => ({ width: 100, height: 100, faces: [{ box: [0, 0, 80, 80, 0.95], points: points(lid, score) }] });
  expect(eyeOpenness(result(16))).toEqual([0.8, 0.8]);
  expect(eyeOpenness(result(2))).toEqual([0.1, 0.1]);
  expect(eyeOpenness(result(16, 0.1))).toBeNull();
  expect(eyeOpenness({ width: 100, height: 100, faces: [] })).toBeNull();
});

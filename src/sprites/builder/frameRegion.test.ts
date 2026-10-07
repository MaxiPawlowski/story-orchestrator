import { mouthRegion, regionWeight, validateRegion } from "./frameRegion";
import { pasteEdit, checkMouthCoverage, type PixelImage } from "./pixels";

const image = (size: number, colour: number): PixelImage => ({ width: size, height: size,
  data: new Uint8ClampedArray(Array.from({ length: size * size }, () => [colour, colour, colour, 255]).flat()) });

test("the Belle old-mouth rows are opaque, rather than feathered into the original smile", () => {
  const base = image(320, 220), edit = image(320, 100), box = { x: 0, y: 0, width: 320, height: 320 };
  const region = mouthRegion(box);
  const output = pasteEdit(base, edit, box, "talk");
  for (const y of [170, 179, 184, 189, 194]) {
    const offset = (y * 320 + 154) * 4;
    expect(output.data[offset + 3]).toBe(255);
    expect(output.data[offset]).toBe(100);
  }
  const old = { ...output, data: new Uint8ClampedArray(output.data) };
  old.data[(179 * 320 + 154) * 4 + 3] = 60;
  expect(checkMouthCoverage(base, old, box, region)).toHaveLength(1);
  expect(checkMouthCoverage(base, output, box, region)).toEqual([]);
  expect(output.data[(100 * 320 + 154) * 4 + 3]).toBe(0);
  const blink = pasteEdit(base, edit, box, "blink");
  expect(blink.data.some((value, offset) => offset % 4 === 3 && value > 0 && output.data[offset] > 0)).toBe(false);
});

test("feather surrounds an opaque core and invalid or all-feather regions are refused", () => {
  const region = { x: 10, y: 20, width: 30, height: 20, feather: 3 };
  expect(regionWeight(20, 25, region)).toBe(1);
  expect(regionWeight(10, 20, region)).toBeCloseTo(1 / 6);
  expect(regionWeight(9, 20, region)).toBe(0);
  expect(() => validateRegion({ width: 32, height: 32 }, region)).toThrow();
  expect(() => validateRegion({ width: 64, height: 64 }, { ...region, feather: 10 })).toThrow();
});

test("a shifted region and changed reference alpha still keep their precise coverage contract", () => {
  const base = image(64, 220), edit = image(32, 100), box = { x: 8, y: 16, width: 32, height: 32 };
  const region = { x: 8, y: 18, width: 16, height: 10, feather: 2 };
  base.data[((box.y + 22) * 64 + box.x + 12) * 4 + 3] = 128;
  const output = pasteEdit(base, edit, box, "talk", region);
  expect(checkMouthCoverage(base, output, box, region)).toEqual([]);
  expect(output.data[((box.y + 22) * 64 + box.x + 12) * 4 + 3]).toBe(128);
});

test("a corrected resting sprite is a complete image with unchanged eyes, body and reference alpha", () => {
  const base = image(64, 220), edit = image(32, 100), box = { x: 8, y: 8, width: 32, height: 32 };
  const region = mouthRegion(box);
  const output = pasteEdit(base, edit, box, "rest");
  expect(checkMouthCoverage(base, output, box, region, false)).toEqual([]);
  expect(output.data.slice(0, 4)).toEqual(base.data.slice(0, 4));
  for (let at = 3; at < output.data.length; at += 4) expect(output.data[at]).toBe(base.data[at]);
  const bad = { ...output, data: new Uint8ClampedArray(output.data) };
  bad.data[((box.y + 4) * 64 + box.x + 4) * 4] = 1;
  expect(checkMouthCoverage(base, bad, box, region, false)).toHaveLength(1);
});

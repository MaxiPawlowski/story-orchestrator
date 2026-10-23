import { seamProblem, seamScore, SEAM_LIMIT } from "./seam";
import { editWeights, pasteEdit } from "./pixels";

const textured = (shift = 0) => {
  const image = { width: 48, height: 48, data: new Uint8ClampedArray(48 * 48 * 4) };
  for (let at = 0; at < 48 * 48; at++) image.data.set([140 + (at % 9) + shift, 100 + (at % 5) + shift, 80 + shift, 255], at * 4);
  return image;
};
const box = { x: 8, y: 8, width: 32, height: 32 };
const editOf = (source: ReturnType<typeof textured>) => {
  const edit = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) edit.data.set(source.data.subarray(((8 + y) * 48 + 8 + x) * 4, ((8 + y) * 48 + 8 + x) * 4 + 4), (y * 32 + x) * 4);
  return edit;
};

test("a frame whose border matches the base scores zero; a uniform shift along the feather is a seam", () => {
  const base = textured();
  const clean = pasteEdit(base, editOf(base), box, "blink");
  expect(seamScore(base, clean)).toBe(0);
  expect(seamProblem(base, clean)).toEqual([]);
  const shifted = { ...clean, data: new Uint8ClampedArray(clean.data) };
  const weights = editWeights(box, "blink");
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!weights[y * 32 + x]) continue;
    const at = ((8 + y) * 48 + 8 + x) * 4;
    for (let channel = 0; channel < 3; channel++) shifted.data[at + channel] -= 6;
  }
  expect(seamScore(base, shifted)!).toBeGreaterThan(SEAM_LIMIT);
  expect(seamProblem(base, shifted)[0]).toMatch(/visible seam.*Render it again/);
});

test("a full composite has no feather to read and is not scored", () => {
  const base = textured();
  expect(seamScore(base, textured(4))).toBeNull();
});

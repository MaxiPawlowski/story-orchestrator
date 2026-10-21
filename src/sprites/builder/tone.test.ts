import { editWeights, pasteEdit, toneOffset } from "./pixels";

test("an edit rendered a few levels darker is pasted at the base's tone; its real change survives and the shift does not", () => {
  const base = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
  for (let at = 0; at < 32 * 32; at++) base.data.set([150 + (at % 7), 110 + (at % 5), 90, 255], at * 4);
  const box = { x: 8, y: 8, width: 16, height: 16 };
  const edit = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const at = ((8 + y) * 32 + 8 + x) * 4, closed = y >= 5 && y < 7 && x >= 4 && x < 12;
    edit.data.set(closed ? [40, 30, 30, 255] : [base.data[at] - 5, base.data[at + 1] - 5, base.data[at + 2] - 5, 255], (y * 16 + x) * 4);
  }
  expect(toneOffset(base, edit, box, editWeights(box, "blink"))).toEqual([-5, -5, -5]);
  const frame = pasteEdit(base, edit, box, "blink");
  const shown = (x: number, y: number) => Array.from(frame.data.subarray(((8 + y) * 32 + 8 + x) * 4, ((8 + y) * 32 + 8 + x) * 4 + 3));
  const original = (x: number, y: number) => Array.from(base.data.subarray(((8 + y) * 32 + 8 + x) * 4, ((8 + y) * 32 + 8 + x) * 4 + 3));
  expect(shown(8, 4)).toEqual(original(8, 4));
  expect(shown(6, 5)).toEqual([45, 35, 35]);
});

test("an edit that matches the base keeps every pixel as rendered: no offset is invented", () => {
  const base = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4).map((_, at) => at % 4 === 3 ? 255 : (at * 13) % 200) };
  const box = { x: 8, y: 8, width: 16, height: 16 };
  const edit = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
  for (let y = 0; y < 16; y++) edit.data.set(base.data.subarray(((8 + y) * 32 + 8) * 4, ((8 + y) * 32 + 24) * 4), y * 64);
  expect(toneOffset(base, edit, box, editWeights(box, "expression"))).toEqual([0, 0, 0]);
});

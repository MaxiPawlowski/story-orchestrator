import type { PixelImage } from "../../builder/pixels";
import type { Point } from "../types";
import { refineEye } from "./eyeRefine";

const SKIN: [number, number, number] = [246, 214, 190];
const SHADE: [number, number, number] = [214, 180, 158];
const WHITE: [number, number, number] = [250, 250, 248];
const IRIS: [number, number, number] = [60, 150, 70];
const LASH: [number, number, number] = [30, 20, 20];

function face(): PixelImage {
  const width = 80, height = 60, data = new Uint8ClampedArray(width * height * 4);
  const paint = (x: number, y: number, rgb: [number, number, number]) => { const i = (y * width + x) * 4; data.set([...rgb, 255], i); };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ex = (x + 0.5 - 40) / 20, ey = (y + 0.5 - 30) / 8, shade = ((x + 0.5 - 40) / 20) ** 2 + ((y + 0.5 - 40) / 8) ** 2 < 1 && y > 37;
    paint(x, y, shade ? SHADE : SKIN);
    if (ex * ex + ey * ey < 1) paint(x, y, (x - 40) ** 2 + (y - 30) ** 2 < 36 ? IRIS : WHITE);
    if (Math.abs(ey + 1.1) < 0.18 && Math.abs(ex) < 1.05) paint(x, y, LASH);
  }
  return { width, height, data };
}

const seed: Point[] = [[30, 30], [34, 25], [46, 25], [50, 30], [46, 35], [34, 35]];

describe("refineEye", () => {
  test("grows a landmark hexagon to the drawn eye white, stops at the lash line and spares shaded skin", () => {
    const refined = refineEye(face(), seed), xs = refined.map((p) => p[0]), ys = refined.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThanOrEqual(25);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(55);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(22);
    expect(Math.max(...ys)).toBeLessThanOrEqual(39);
  });

  test("keeps the landmarks when no skin surrounds the eye", () => {
    const image = face();
    image.data.fill(0);
    expect(refineEye(image, seed)).toBe(seed);
  });
});

import { cleanEdges, edgeReport, EDGE_FLOOR } from "./edges";
import type { PixelImage } from "./pixels";

const sprite = (): PixelImage => {
  const width = 20, height = 20, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) data.set([200, 40, 30, 255], (y * width + x) * 4);
  for (let y = 4; y < 16; y++) { data.set([250, 250, 250, 120], (y * width + 3) * 4); data.set([250, 250, 250, 12], (y * width + 2) * 4); }
  return { width, height, data };
};

test("a fringe pixel takes the colour of the solid pixels inside it, faint fringe is dropped, solid pixels are untouched", () => {
  const image = sprite(), { image: cleaned, report } = cleanEdges(image);
  const at = (x: number, y: number) => Array.from(cleaned.data.subarray((y * 20 + x) * 4, (y * 20 + x) * 4 + 4));
  expect(at(3, 8).slice(0, 3)).toEqual([200, 40, 30]);
  expect(at(3, 8)[3]).toBe(Math.round(255 * (120 / 255 - EDGE_FLOOR) / (1 - EDGE_FLOOR)));
  expect(at(2, 8)).toEqual([0, 0, 0, 0]);
  expect(at(8, 8)).toEqual([200, 40, 30, 255]);
  expect(report.bright).toBe(12);
  expect(report.drift).toBeGreaterThan(200);
  expect(edgeReport(cleaned)).toEqual({ fringe: 12, bright: 0, drift: 0 });
  expect(image.data[(8 * 20 + 3) * 4]).toBe(250);
});

test("a fringe pixel with no solid pixel nearby keeps its colour and only has its alpha tightened", () => {
  const data = new Uint8ClampedArray(30 * 30 * 4);
  data.set([90, 90, 90, 200], (15 * 30 + 15) * 4);
  const { image } = cleanEdges({ width: 30, height: 30, data });
  expect(Array.from(image.data.subarray((15 * 30 + 15) * 4, (15 * 30 + 15) * 4 + 4))).toEqual([90, 90, 90, Math.round(255 * (200 / 255 - EDGE_FLOOR) / (1 - EDGE_FLOOR))]);
});

import { alignEdit, cropPixels, distanceTo, importMaskOnly, scaleProblem } from "./maskImport";
import { editWeights, pasteEdit, type PixelImage } from "./pixels";
import { mouthRegion } from "./frameRegion";

const SIZE = 64;
const box = { x: 8, y: 8, width: 48, height: 48 };
const noise = (x: number, y: number, channel: number) => 30 + (((x * 73856093) ^ (y * 19349663) ^ (channel * 83492791)) >>> 0) % 200;

const base = (): PixelImage => {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const at = (y * SIZE + x) * 4, inside = (x - 32) ** 2 + (y - 34) ** 2 < 27 ** 2;
    for (let channel = 0; channel < 3; channel += 1) data[at + channel] = noise(x, y, channel);
    data[at + 3] = inside ? 255 : 0;
  }
  return { width: SIZE, height: SIZE, data };
};

const reference = base();
const source = cropPixels(reference, box);
const region = mouthRegion(box);
const mask = Uint8Array.from(editWeights(box, "talk"), (weight) => (weight > 0 ? 1 : 0));
const mouth = { x: region.x + 5, y: region.y + 3, width: 7, height: 4 };

const flattened = (image: PixelImage, change: (x: number, y: number, rgb: number[]) => number[] = (_x, _y, rgb) => rgb): PixelImage => {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const at = (y * image.width + x) * 4, alpha = image.data[at + 3] / 255;
    const rgb = [0, 1, 2].map((channel) => Math.round(image.data[at + channel] * alpha + 255 * (1 - alpha)));
    const inMouth = x >= mouth.x && x < mouth.x + mouth.width && y >= mouth.y && y < mouth.y + mouth.height;
    const next = change(x, y, inMouth ? [20, 20, 20] : rgb);
    data.set([...next, 255], at);
  }
  return { width: image.width, height: image.height, data };
};

const moved = (image: PixelImage, dx: number, dy: number): PixelImage => {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const sx = Math.min(image.width - 1, Math.max(0, x - dx)), sy = Math.min(image.height - 1, Math.max(0, y - dy));
    data.set(image.data.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4), (y * image.width + x) * 4);
  }
  return { width: image.width, height: image.height, data };
};

const outsideMaskMatches = (image: PixelImage) => {
  let worst = 0;
  for (let at = 0; at < mask.length; at += 1) {
    if (mask[at] || source.data[at * 4 + 3] < 240) continue;
    for (let channel = 0; channel < 3; channel += 1) worst = Math.max(worst, Math.abs(image.data[at * 4 + channel] - source.data[at * 4 + channel]));
  }
  return worst;
};

describe("mask-only import of a generated frame (mesh-avatar-studio 26243f9 port)", () => {
  it("accepts a clean edit unchanged, restores the source alpha and measures no tint", () => {
    const { image, report } = importMaskOnly(source, flattened(source), mask);
    expect(report).toMatchObject({ shift: { x: 0, y: 0 }, corrected: { x: 0, y: 0 }, tint: [0, 0, 0], compared: true, opaqueMean: 0, ringShare: 0 });
    for (let at = 3; at < image.data.length; at += 4) expect(image.data[at]).toBe(source.data[at]);
    expect(outsideMaskMatches(image)).toBe(0);
  });

  it("finds and corrects a whole-image shift of up to 3 px", () => {
    const { image, report } = importMaskOnly(source, moved(flattened(source), 2, -1), mask);
    expect(report.shift).toEqual({ x: 2, y: -1 });
    expect(report.corrected).toEqual({ x: 2, y: -1 });
    expect(report.opaqueMean).toBeLessThan(8);
    const centre = (34 - box.y) * box.width + (20 - box.x);
    expect([...image.data.subarray(centre * 4, centre * 4 + 3)]).toEqual([...source.data.subarray(centre * 4, centre * 4 + 3)]);
  });

  it("rejects a shift past 3 px with the measured offset", () => {
    expect(() => importMaskOnly(source, moved(flattened(source), 5, 0), mask)).toThrow("The edit is shifted by 5, 0 px (limit 3 px)");
  });

  it("removes a tint measured just inside the mask edge from the mask area only", () => {
    const tinted = flattened(source, (_x, _y, rgb) => [rgb[0] + 12, rgb[1] - 6, rgb[2] + 3]);
    const { image, report } = importMaskOnly(source, tinted, mask);
    expect(report.tint).toEqual([12, -6, 3]);
    for (let at = 0; at < mask.length; at += 1) {
      const x = at % box.width, y = Math.floor(at / box.width);
      const inMouth = x >= mouth.x && x < mouth.x + mouth.width && y >= mouth.y && y < mouth.y + mouth.height;
      if (!mask[at] || inMouth) continue;
      expect([...image.data.subarray(at * 4, at * 4 + 3)]).toEqual([...source.data.subarray(at * 4, at * 4 + 3)]);
    }
  });

  it("leaves a tint above 24 levels alone", () => {
    const tinted = flattened(source, (x, y, rgb) => (mask[y * box.width + x] ? [rgb[0] + 30, rgb[1], rgb[2]] : rgb));
    const { image, report } = importMaskOnly(source, tinted, mask);
    expect(report.tint).toEqual([0, 0, 0]);
    const inside = (region.y + 1) * box.width + region.x + 1;
    expect(image.data[inside * 4]).toBe(Math.min(255, source.data[inside * 4] + 30));
  });

  it("rejects a drawing that spills past the mask edge", () => {
    const spilled = flattened(source, (x, y, rgb) => (x >= region.x - 6 && x < region.x + region.width + 6 && y >= region.y + region.height && y < region.y + region.height + 8 ? rgb.map((value) => (value < 128 ? value + 70 : value - 70)) : rgb));
    expect(() => importMaskOnly(source, spilled, mask)).toThrow(/spills past its mask edge \(within 12 px: mean [\d.]+\/255, \d+% over 48/);
  });

  it("rejects a picture redrawn outside the mask", () => {
    const redrawn = flattened(source, (_x, _y, rgb) => rgb.map((value) => value + 40));
    expect(() => importMaskOnly(source, redrawn, mask)).toThrow(/redrew the picture outside its mask \(mean change [\d.]+\/255, limit 16\)/);
  });

  it("rescales only a result with the head box's aspect ratio", () => {
    expect(scaleProblem({ width: 96, height: 96 }, box)).toBeNull();
    expect(scaleProblem({ width: 1024, height: 1088 }, { width: 300, height: 320 })).toBeNull();
    expect(scaleProblem({ width: 96, height: 70 }, box)).toContain("a different aspect ratio from the 48 × 48 head box");
    const big = flattened(source);
    const doubled: PixelImage = { width: 96, height: 96, data: new Uint8ClampedArray(96 * 96 * 4) };
    for (let y = 0; y < 96; y += 1) for (let x = 0; x < 96; x += 1) doubled.data.set(big.data.subarray(((y >> 1) * 48 + (x >> 1)) * 4, ((y >> 1) * 48 + (x >> 1)) * 4 + 4), (y * 96 + x) * 4);
    const half = (image: PixelImage, target: { width: number; height: number }): PixelImage => {
      const data = new Uint8ClampedArray(target.width * target.height * 4);
      for (let y = 0; y < target.height; y += 1) for (let x = 0; x < target.width; x += 1) data.set(image.data.subarray(((y * 2) * image.width + x * 2) * 4, ((y * 2) * image.width + x * 2) * 4 + 4), (y * target.width + x) * 4);
      return { width: target.width, height: target.height, data };
    };
    const { edit, report } = alignEdit(reference, doubled, box, "talk", undefined, half);
    expect(report.scaled).toBe(true);
    expect(outsideMaskMatches(edit)).toBe(0);
    const frame = pasteEdit(reference, edit, box, "talk");
    expect(frame.data[((box.y + mouth.y) * SIZE + box.x + mouth.x) * 4]).toBe(20);
    expect(() => alignEdit(reference, { width: 96, height: 60, data: new Uint8ClampedArray(96 * 60 * 4) }, box, "talk", undefined, half)).toThrow("different aspect ratio");
  });

  it("measures distance to the mask in pixels", () => {
    const target = new Uint8Array(25);
    target[12] = 1;
    const distance = distanceTo(target, 5, 5);
    expect([distance[12], distance[13], distance[14], distance[0]]).toEqual([0, 1, 2, Math.fround(2 * Math.SQRT2)]);
  });
});

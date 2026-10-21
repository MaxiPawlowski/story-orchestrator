import type { PixelImage } from "./pixels";

export const EDGE_SOLID = 250;
export const EDGE_FLOOR = 0.12;
const RADII = [2, 4, 7];

export interface EdgeReport { fringe: number; bright: number; drift: number; recoloured: number; dropped: number }

const lumaAt = (data: Uint8ClampedArray, at: number): number => (data[at] + data[at + 1] + data[at + 2]) / 3;

export function edgeReport(image: PixelImage): Omit<EdgeReport, "recoloured" | "dropped"> & { drift: number } {
  let fringe = 0, bright = 0, drift = 0, measured = 0;
  for (let at = 0; at < image.data.length; at += 4) {
    const alpha = image.data[at + 3];
    if (alpha <= 16 || alpha >= 240) continue;
    fringe++;
    if (lumaAt(image.data, at) > 200) bright++;
    const pixel = at / 4, colour = solidColour(image, pixel % image.width, Math.floor(pixel / image.width));
    if (!colour) continue;
    drift += Math.hypot(image.data[at] - colour[0], image.data[at + 1] - colour[1], image.data[at + 2] - colour[2]);
    measured++;
  }
  return { fringe, bright, drift: measured ? Math.round(drift / measured * 10) / 10 : 0 };
}

function solidColour(image: PixelImage, x: number, y: number): [number, number, number] | null {
  const { width, height, data } = image;
  for (const radius of RADII) {
    let r = 0, g = 0, b = 0, weight = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || dx * dx + dy * dy > radius * radius) continue;
      const at = (ny * width + nx) * 4;
      if (data[at + 3] < EDGE_SOLID) continue;
      const w = 1 / (1 + dx * dx + dy * dy);
      r += data[at] * w; g += data[at + 1] * w; b += data[at + 2] * w; weight += w;
    }
    if (weight > 0) return [r / weight, g / weight, b / weight];
  }
  return null;
}

export function cleanEdges(image: PixelImage): { image: PixelImage; report: EdgeReport } {
  const { width, height } = image, data = new Uint8ClampedArray(image.data);
  const before = edgeReport(image);
  let recoloured = 0, dropped = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4, alpha = image.data[at + 3];
    if (alpha === 0 || alpha >= EDGE_SOLID) continue;
    const tightened = Math.round(255 * Math.min(1, Math.max(0, (alpha / 255 - EDGE_FLOOR) / (1 - EDGE_FLOOR))));
    if (tightened === 0) { data[at] = data[at + 1] = data[at + 2] = data[at + 3] = 0; dropped++; continue; }
    data[at + 3] = tightened;
    const colour = solidColour(image, x, y);
    if (!colour) continue;
    data[at] = Math.round(colour[0]); data[at + 1] = Math.round(colour[1]); data[at + 2] = Math.round(colour[2]);
    recoloured++;
  }
  return { image: { ...image, data }, report: { ...before, recoloured, dropped } };
}

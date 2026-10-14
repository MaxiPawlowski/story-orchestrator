/*! Checks adapted from mesh-avatar-studio tools/build-sprites.py "mask-only import" (26243f9).
MIT License

Copyright (c) 2026 Yuki Shindo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import type { EditKind } from "./recipes";
import type { FrameRegion } from "./frameRegion";
import { editWeights, validateBox, type HeadBox, type PixelImage } from "./pixels";

export const MASK_IMPORT = {
  maxShift: 3, searchShift: 6, maxOpaqueMean: 16, ring: 12, maxRingMean: 20, maxRingShare: 0.12, ringLevel: 48,
  tintBand: 10, maxTint: 24, opaqueAlpha: 240, aspectTolerance: 0.005, encoderRound: 16,
} as const;

export const MASK_IMPORT_KINDS: readonly EditKind[] = ["expression", "blink", "talk", "talk2", "mouth_o", "mouth_wide", "rest"];

export interface MaskImportReport {
  shift: { x: number; y: number };
  corrected: { x: number; y: number };
  tint: [number, number, number];
  opaqueMean: number;
  ringMean: number;
  ringShare: number;
  compared: boolean;
  scaled: boolean;
}

type Size = Pick<PixelImage, "width" | "height">;

export function cropPixels(image: PixelImage, box: HeadBox): PixelImage {
  validateBox(image, box);
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    const from = ((box.y + y) * image.width + box.x) * 4;
    data.set(image.data.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return { width: box.width, height: box.height, data };
}

export function scaleProblem(raw: Size, box: Size): string | null {
  if (raw.width === box.width && raw.height === box.height) return null;
  const error = Math.abs((raw.width * box.height) / (raw.height * box.width) - 1);
  const tolerance = MASK_IMPORT.aspectTolerance + MASK_IMPORT.encoderRound / Math.max(1, raw.width) + MASK_IMPORT.encoderRound / Math.max(1, raw.height);
  return error > tolerance
    ? `The edit came back at ${raw.width} × ${raw.height}, a different aspect ratio from the ${box.width} × ${box.height} head box, so it is not the same picture. Render it again.`
    : null;
}

const composite = (image: PixelImage): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(image.width * image.height * 3);
  for (let at = 0, to = 0; at < image.data.length; at += 4, to += 3) {
    const alpha = image.data[at + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) out[to + channel] = Math.round(image.data[at + channel] * alpha + 255 * (1 - alpha));
  }
  return out;
};

const edges = (rgb: Uint8ClampedArray, width: number, height: number): Float32Array => {
  const grey = new Float32Array(width * height);
  for (let at = 0; at < grey.length; at += 1) grey[at] = (rgb[at * 3] + rgb[at * 3 + 1] + rgb[at * 3 + 2]) / 3;
  const read = (x: number, y: number) => grey[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const gx = read(x + 1, y - 1) + 2 * read(x + 1, y) + read(x + 1, y + 1) - read(x - 1, y - 1) - 2 * read(x - 1, y) - read(x - 1, y + 1);
    const gy = read(x - 1, y + 1) + 2 * read(x, y + 1) + read(x + 1, y + 1) - read(x - 1, y - 1) - 2 * read(x, y - 1) - read(x + 1, y - 1);
    out[y * width + x] = Math.abs(gx) + Math.abs(gy);
  }
  return out;
};

export function distanceTo(target: Uint8Array, width: number, height: number): Float32Array {
  const diagonal = Math.SQRT2;
  const distance = new Float32Array(width * height);
  for (let at = 0; at < distance.length; at += 1) distance[at] = target[at] ? 0 : Infinity;
  const relax = (at: number, x: number, y: number, dx: number, dy: number, step: number) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
    const candidate = distance[ny * width + nx] + step;
    if (candidate < distance[at]) distance[at] = candidate;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const at = y * width + x;
    relax(at, x, y, -1, 0, 1); relax(at, x, y, 0, -1, 1); relax(at, x, y, -1, -1, diagonal); relax(at, x, y, 1, -1, diagonal);
  }
  for (let y = height - 1; y >= 0; y -= 1) for (let x = width - 1; x >= 0; x -= 1) {
    const at = y * width + x;
    relax(at, x, y, 1, 0, 1); relax(at, x, y, 0, 1, 1); relax(at, x, y, 1, 1, diagonal); relax(at, x, y, -1, 1, diagonal);
  }
  return distance;
}

const shifted = (image: PixelImage, dx: number, dy: number): PixelImage => {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const sx = Math.min(image.width - 1, Math.max(0, x + dx)), sy = Math.min(image.height - 1, Math.max(0, y + dy));
    const from = (sy * image.width + sx) * 4, to = (y * image.width + x) * 4;
    data[to] = image.data[from]; data[to + 1] = image.data[from + 1]; data[to + 2] = image.data[from + 2]; data[to + 3] = image.data[from + 3];
  }
  return { width: image.width, height: image.height, data };
};

const deltas = (source: Uint8ClampedArray, variant: Uint8ClampedArray): Uint8Array => {
  const out = new Uint8Array(source.length / 3);
  for (let at = 0; at < out.length; at += 1) {
    out[at] = Math.max(Math.abs(source[at * 3] - variant[at * 3]), Math.abs(source[at * 3 + 1] - variant[at * 3 + 1]), Math.abs(source[at * 3 + 2] - variant[at * 3 + 2]));
  }
  return out;
};

const meanOver = (values: ArrayLike<number>, pixels: number[]): number => {
  let sum = 0;
  for (const at of pixels) sum += values[at];
  return pixels.length ? sum / pixels.length : 0;
};

const candidates = (radius: number): Array<[number, number]> => {
  const list: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) list.push([dx, dy]);
  return list.sort((a, b) => Math.max(Math.abs(a[0]), Math.abs(a[1])) - Math.max(Math.abs(b[0]), Math.abs(b[1]))
    || Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]) || a[1] - b[1] || a[0] - b[0]);
};

export function measureShift(source: PixelImage, variant: PixelImage, rest: number[]): { x: number; y: number } {
  const { width, height } = source;
  const sourceEdges = edges(composite(source), width, height), variantEdges = edges(composite(variant), width, height);
  const samples = rest.filter((_, index) => index % 2 === 0);
  if (!samples.length || meanOver(sourceEdges, samples) < 1) return { x: 0, y: 0 };
  const score = (dx: number, dy: number) => {
    let sum = 0;
    for (const at of samples) {
      const x = at % width, y = (at - x) / width;
      const vx = Math.min(width - 1, Math.max(0, x + dx)), vy = Math.min(height - 1, Math.max(0, y + dy));
      sum += Math.abs(sourceEdges[at] - variantEdges[vy * width + vx]);
    }
    return sum / samples.length;
  };
  const still = score(0, 0);
  let best = { x: 0, y: 0, score: still };
  for (const [dx, dy] of candidates(MASK_IMPORT.searchShift)) {
    if (!dx && !dy) continue;
    const value = score(dx, dy);
    if (value < best.score) best = { x: dx, y: dy, score: value };
  }
  return best.score < still * 0.9 ? { x: best.x, y: best.y } : { x: 0, y: 0 };
}

const lowerMedian = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[(sorted.length - 1) >> 1] : 0;
};

export function importMaskOnly(source: PixelImage, input: PixelImage, mask: Uint8Array, scaled = false): { image: PixelImage; report: MaskImportReport } {
  const { width, height } = source;
  if (input.width !== width || input.height !== height || mask.length !== width * height) throw new Error("Resize the edit to the reference head box before importing it.");
  const opaque = (at: number) => source.data[at * 4 + 3] >= MASK_IMPORT.opaqueAlpha;
  const rest: number[] = [];
  for (let at = 0; at < mask.length; at += 1) if (!mask[at] && opaque(at)) rest.push(at);
  const shift = measureShift(source, input, rest);
  if (Math.max(Math.abs(shift.x), Math.abs(shift.y)) > MASK_IMPORT.maxShift) {
    const edge = Math.max(Math.abs(shift.x), Math.abs(shift.y)) >= MASK_IMPORT.searchShift ? "at least " : "";
    throw new Error(`The edit is shifted by ${edge}${shift.x}, ${shift.y} px (limit ${MASK_IMPORT.maxShift} px), so it is not the same picture. Render it again.`);
  }
  const sourceRgb = composite(source);
  let variant = input, delta = deltas(sourceRgb, composite(input)), corrected = { x: 0, y: 0 };
  if (shift.x || shift.y) {
    const moved = shifted(input, shift.x, shift.y), movedDelta = deltas(sourceRgb, composite(moved));
    if (meanOver(movedDelta, rest) < meanOver(delta, rest)) { variant = moved; delta = movedDelta; corrected = shift; }
  }
  const outside = distanceTo(mask, width, height);
  const ring = rest.filter((at) => outside[at] <= MASK_IMPORT.ring);
  const compared = rest.length > 0;
  const opaqueMean = meanOver(delta, rest), ringMean = meanOver(delta, ring);
  const ringShare = ring.length ? ring.filter((at) => delta[at] > MASK_IMPORT.ringLevel).length / ring.length : 0;
  if (compared && opaqueMean > MASK_IMPORT.maxOpaqueMean) {
    throw new Error(`The edit redrew the picture outside its mask (mean change ${opaqueMean.toFixed(1)}/255, limit ${MASK_IMPORT.maxOpaqueMean}). Render it again.`);
  }
  if (ring.length && (ringMean > MASK_IMPORT.maxRingMean || ringShare > MASK_IMPORT.maxRingShare)) {
    throw new Error(`The edit spills past its mask edge (within ${MASK_IMPORT.ring} px: mean ${ringMean.toFixed(1)}/255, ${Math.round(ringShare * 100)}% over ${MASK_IMPORT.ringLevel}; `
      + `limits ${MASK_IMPORT.maxRingMean} and ${Math.round(MASK_IMPORT.maxRingShare * 100)}%). Render it again or widen the mouth region.`);
  }
  const data = new Uint8ClampedArray(variant.data);
  for (let at = 3; at < data.length; at += 4) data[at] = source.data[at];
  const inverse = new Uint8Array(mask.length);
  for (let at = 0; at < mask.length; at += 1) inverse[at] = mask[at] ? 0 : 1;
  const inside = distanceTo(inverse, width, height);
  const band: number[] = [];
  for (let at = 0; at < mask.length; at += 1) if (mask[at] && opaque(at) && inside[at] <= MASK_IMPORT.tintBand) band.push(at);
  let tint: [number, number, number] = [0, 0, 0];
  if (band.length) {
    const measured = [0, 1, 2].map((channel) => lowerMedian(band.map((at) => data[at * 4 + channel] - source.data[at * 4 + channel]))) as [number, number, number];
    if (Math.max(...measured.map(Math.abs)) <= MASK_IMPORT.maxTint && measured.some(Boolean)) {
      tint = measured;
      for (let at = 0; at < mask.length; at += 1) if (mask[at]) for (let channel = 0; channel < 3; channel += 1) data[at * 4 + channel] -= tint[channel];
    }
  }
  return { image: { width, height, data }, report: { shift, corrected, tint, opaqueMean, ringMean, ringShare, compared, scaled } };
}

export function alignEdit(base: PixelImage, raw: PixelImage, box: HeadBox, kind: EditKind, region: FrameRegion | undefined,
  resize: (image: PixelImage, box: HeadBox) => PixelImage): { edit: PixelImage; report: MaskImportReport } {
  const problem = scaleProblem(raw, box);
  if (problem) throw new Error(problem);
  const scaled = raw.width !== box.width || raw.height !== box.height;
  const variant = scaled ? resize(raw, box) : raw;
  const weights = editWeights(box, kind, region);
  const mask = new Uint8Array(weights.length);
  for (let at = 0; at < weights.length; at += 1) mask[at] = weights[at] > 0 ? 1 : 0;
  const { image, report } = importMaskOnly(cropPixels(base, box), variant, mask, scaled);
  return { edit: image, report };
}

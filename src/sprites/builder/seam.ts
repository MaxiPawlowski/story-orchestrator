export interface PixelImage { width: number; height: number; data: Uint8ClampedArray }

export const SEAM_LIMIT = 1.3;
const OUTER = 0.5;
const MIN_SAMPLES = 40;

const luma = (data: Uint8ClampedArray, at: number): number => 0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2];

export function seamScore(base: PixelImage, overlay: PixelImage): number | null {
  if (base.width !== overlay.width || base.height !== overlay.height) return null;
  const diffs: number[] = [];
  for (let at = 0; at < base.data.length; at += 4) {
    const solid = base.data[at + 3];
    if (solid < 240) continue;
    const share = overlay.data[at + 3] / solid;
    if (share <= 0.02 || share >= OUTER) continue;
    diffs.push(luma(overlay.data, at) - luma(base.data, at));
  }
  if (diffs.length < MIN_SAMPLES) return null;
  diffs.sort((x, y) => x - y);
  return Math.round(Math.abs(diffs[diffs.length >> 1]) * 10) / 10;
}

export function seamProblem(base: PixelImage, overlay: PixelImage): string[] {
  const score = seamScore(base, overlay);
  return score !== null && score > SEAM_LIMIT ? [`The edit leaves a visible seam around its box (border differs by ${score} levels). Render it again.`] : [];
}

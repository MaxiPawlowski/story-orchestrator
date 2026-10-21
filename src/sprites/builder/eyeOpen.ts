import { readDetectorResult } from "../liveHead/synthesis/landmarkCheck";
import type { HeadBox, PixelImage } from "./pixels";

export const BLINK_OPEN_LIMIT = 0.35;
export const BLINK_MIN_WHITES = 6;
const EYE_POINTS = [[11, 12, 13, 14, 15, 16], [17, 18, 19, 20, 21, 22]] as const;
const MIN_POINT_SCORE = 0.3;

export function eyeBoxes(result: unknown, image: Pick<PixelImage, "width" | "height">): HeadBox[] | null {
  const read = readDetectorResult(result);
  if (!read || !read.faces.length || read.width <= 0 || read.height <= 0) return null;
  const sx = image.width / read.width, sy = image.height / read.height;
  const face = read.faces.reduce((best, entry) => (entry.box[2] - entry.box[0]) * (entry.box[3] - entry.box[1]) > (best.box[2] - best.box[0]) * (best.box[3] - best.box[1]) ? entry : best);
  const boxes: HeadBox[] = [];
  for (const indexes of EYE_POINTS) {
    const points = indexes.map((index) => face.points[index]);
    if (points.some((point) => point[2] < MIN_POINT_SCORE)) return null;
    const xs = points.map((point) => point[0] * sx), ys = points.map((point) => point[1] * sy), width = Math.max(...xs) - Math.min(...xs);
    const x = Math.max(0, Math.floor(Math.min(...xs))), y = Math.max(0, Math.floor(Math.min(...ys) - width * 0.15));
    boxes.push({ x, y, width: Math.min(image.width, Math.ceil(Math.max(...xs))) - x, height: Math.min(image.height, Math.ceil(Math.max(...ys) + width * 0.15)) - y });
  }
  return boxes;
}

export function eyeWhites(image: PixelImage, box: HeadBox): number {
  let count = 0;
  for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
    const at = (y * image.width + x) * 4;
    if (image.data[at + 3] < 200) continue;
    const r = image.data[at] / 255, g = image.data[at + 1] / 255, b = image.data[at + 2] / 255;
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 0.1 && 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.55) count++;
  }
  return count;
}

export function overBase(base: PixelImage, overlay: PixelImage): PixelImage {
  const data = new Uint8ClampedArray(base.data);
  for (let at = 0; at < data.length; at += 4) {
    const a = overlay.data[at + 3] / 255;
    if (!a) continue;
    for (let channel = 0; channel < 3; channel++) data[at + channel] = Math.round(overlay.data[at + channel] * a + base.data[at + channel] * (1 - a));
  }
  return { width: base.width, height: base.height, data };
}

export function blinkProblems(base: PixelImage, shown: PixelImage, eyes: HeadBox[]): string[] {
  return eyes.flatMap((box, index) => {
    const open = eyeWhites(base, box);
    if (open < BLINK_MIN_WHITES) return [];
    const left = eyeWhites(shown, box) / open;
    return left > BLINK_OPEN_LIMIT ? [`The blink leaves the ${index ? "second" : "first"} eye open (${Math.round(left * 100)}% of its white still shows).`] : [];
  });
}

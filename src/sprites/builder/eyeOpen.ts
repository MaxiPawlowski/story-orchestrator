import { readDetectorResult, type DetectorFace } from "../liveHead/synthesis/landmarkCheck";
import type { HeadBox, PixelImage } from "./pixels";

export const BLINK_OPEN_LIMIT = 0.35;
export const BLINK_MIN_WHITES = 6;
export const EYE_CLOSED_LIMIT = 0.3;
export const EYE_CLOSED_SHARE = 0.6;
const EYE_POINTS = [[11, 12, 13, 14, 15, 16], [17, 18, 19, 20, 21, 22]] as const;
const MIN_POINT_SCORE = 0.3;
const area = (face: DetectorFace): number => (face.box[2] - face.box[0]) * (face.box[3] - face.box[1]);

export function eyeBoxes(result: unknown, image: Pick<PixelImage, "width" | "height">): HeadBox[] | null {
  const read = readDetectorResult(result);
  if (!read || !read.faces.length || read.width <= 0 || read.height <= 0) return null;
  const sx = image.width / read.width, sy = image.height / read.height;
  const face = read.faces.reduce((best, entry) => area(entry) > area(best) ? entry : best);
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

export interface EyeRead { boxes: HeadBox[] | null; openness: number[] | null; faces?: number }

export const faceCount = (result: unknown): number => readDetectorResult(result)?.faces.length ?? 0;

export const CUTOUT_SHARE = 0.05;

export function isCutout(image: PixelImage): boolean {
  let clear = 0;
  for (let at = 3; at < image.data.length; at += 4) if (image.data[at] < 16) clear++;
  return clear > image.width * image.height * CUTOUT_SHARE;
}

export function eyeOpenness(result: unknown): number[] | null {
  const read = readDetectorResult(result);
  if (!read || !read.faces.length) return null;
  const face = read.faces.reduce((best, entry) => area(entry) > area(best) ? entry : best);
  const open: number[] = [];
  for (const indexes of EYE_POINTS) {
    const points = indexes.map((index) => face.points[index]);
    if (points.some((point) => !point || point[2] < MIN_POINT_SCORE)) return null;
    const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]), width = Math.max(...xs) - Math.min(...xs);
    if (width <= 0) return null;
    open.push((Math.max(...ys) - Math.min(...ys)) / width);
  }
  return open;
}

export function stillOpen(before: number[] | null, after: number[] | null | undefined): boolean[] | undefined {
  if (!before || !after) return undefined;
  return after.map((value, index) => value > Math.max(EYE_CLOSED_LIMIT, EYE_CLOSED_SHARE * (before[index] ?? 0)));
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

export function blinkProblems(base: PixelImage, shown: PixelImage, eyes: HeadBox[], lids?: boolean[]): string[] {
  return eyes.flatMap((box, index) => {
    if (lids?.[index] === false) return [];
    const open = eyeWhites(base, box);
    if (open < BLINK_MIN_WHITES) return [];
    const left = eyeWhites(shown, box) / open;
    return left > BLINK_OPEN_LIMIT ? [`The blink leaves the ${index ? "second" : "first"} eye open (${Math.round(left * 100)}% of its white still shows).`] : [];
  });
}

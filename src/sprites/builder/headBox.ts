import { CROSS_CHECK_LIMITS, readDetectorResult } from "../liveHead/synthesis/landmarkCheck";
import type { HeadBox, PixelImage } from "./pixels";

export interface FaceAnchor { cx: number; top: number; chin: number }

const ABOVE_FACE = 0.46;
const BOX_FACES = 2;
const BOX_ASPECT = 1.2;

export const fractionHeadBox = (image: Pick<PixelImage, "width" | "height">): HeadBox => {
  const width = Math.max(8, Math.round(image.width * 0.45)), height = Math.max(8, Math.round(image.height * 0.25));
  return { x: Math.round((image.width - width) / 2), y: 0, width, height };
};

export function faceAnchor(result: unknown, image: Pick<PixelImage, "width" | "height">): FaceAnchor | null {
  const read = readDetectorResult(result);
  if (!read || read.width <= 0 || read.height <= 0) return null;
  const sx = image.width / read.width, sy = image.height / read.height;
  const area = (entry: (typeof read.faces)[number]) => (entry.box[2] - entry.box[0]) * (entry.box[3] - entry.box[1]);
  const face = read.faces.filter((entry) => entry.box[4] >= CROSS_CHECK_LIMITS.minBoxScore)
    .reduce<(typeof read.faces)[number] | undefined>((best, entry) => !best || area(entry) > area(best) ? entry : best, undefined);
  if (!face) return null;
  const [x0, y0, x1, y1] = face.box, chinPoint = face.points[2];
  const height = y1 - y0;
  if (x1 - x0 < CROSS_CHECK_LIMITS.minFaceWidth || height <= 0) return null;
  const chin = chinPoint && chinPoint[2] >= CROSS_CHECK_LIMITS.minPointScore && chinPoint[1] > y0 && chinPoint[1] <= y1 + height * 0.5 ? chinPoint[1] : y1;
  return { cx: Math.round(((x0 + x1) / 2) * sx), top: Math.round(y0 * sy), chin: Math.round(chin * sy) };
}

export function headBox(image: Pick<PixelImage, "width" | "height">, face?: FaceAnchor | null): HeadBox {
  if (!face) return fractionHeadBox(image);
  const faceHeight = Math.max(8, face.chin - face.top);
  const height = Math.min(image.height, Math.round(faceHeight * BOX_FACES)), width = Math.min(image.width, Math.round(height * BOX_ASPECT));
  const clamp = (value: number, most: number) => Math.min(Math.max(0, Math.round(value)), most);
  return { x: clamp(face.cx - width / 2, image.width - width), y: clamp(face.top - faceHeight * ABOVE_FACE, image.height - height), width, height };
}

import { CROSS_CHECK_LIMITS, readDetectorResult } from "../liveHead/synthesis/landmarkCheck";
import { EYE_BAND, type HeadBox, type PixelImage } from "./pixels";

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

export function faceBoxProblem(eyes: readonly HeadBox[] | null | undefined, box: HeadBox): string | null {
  if (!eyes?.length) return null;
  const centres = eyes.map((eye) => ({ x: eye.x + eye.width / 2 - box.x, y: (eye.y + eye.height / 2 - box.y) / box.height }));
  const band = `${Math.round(EYE_BAND.top * 100)}–${Math.round(EYE_BAND.bottom * 100)}%`;
  if (centres.some((eye) => eye.x < 0 || eye.x > box.width || eye.y < 0 || eye.y > 1)) {
    return `The head box misses the face: an eye is outside it. Check the head box for this reference (eyes at ${band} of its height), then generate again.`;
  }
  const off = centres.find((eye) => eye.y < EYE_BAND.top || eye.y > EYE_BAND.bottom);
  return off ? `The head box misses the face: an eye sits at ${Math.round(off.y * 100)}% of its height, outside ${band}. Check the head box for this reference, then generate again.` : null;
}

export function bustBox(image: Pick<PixelImage, "width" | "height">, head: HeadBox): HeadBox {
  const width = Math.min(image.width, Math.round(head.width * 2.2));
  const y = Math.max(0, Math.round(head.y - head.height * 0.5));
  const height = Math.min(image.height, Math.round(head.y + head.height * 2.2)) - y;
  return { x: Math.max(0, Math.min(image.width - width, Math.round(head.x + head.width / 2 - width / 2))), y, width, height };
}

export async function referenceHeadBox(image: Pick<PixelImage, "width" | "height">, saved?: HeadBox, detect?: () => Promise<unknown>): Promise<HeadBox> {
  if (saved) {
    if (Object.values(saved).every(Number.isInteger) && saved.x >= 0 && saved.y >= 0 && saved.width >= 8 && saved.height >= 8
      && saved.x + saved.width <= image.width && saved.y + saved.height <= image.height) return { ...saved };
  }
  const face = detect ? faceAnchor(await detect().catch(() => null), image) : null;
  return headBox(image, face);
}

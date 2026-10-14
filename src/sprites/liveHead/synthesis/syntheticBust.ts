import type { PixelImage } from "../../builder/pixels";
import type { Point } from "../types";
import { LANDMARK_VERSION, type FaceLandmarks } from "./landmarks";
import { insidePolygon as inPolygon } from "./layers";

type Colour = [number, number, number];
const SKIN: Colour = [236, 200, 172], SKIN_DARK: Colour = [214, 172, 146], HAIR: Colour = [74, 48, 36], SHIRT: Colour = [70, 110, 150];
const WHITE: Colour = [250, 250, 246], IRIS: Colour = [60, 96, 170], PUPIL: Colour = [20, 22, 30], LASH: Colour = [32, 22, 22], LIP: Colour = [168, 70, 78];

export interface SyntheticBust { image: PixelImage; landmarks: FaceLandmarks }

const almond = (cx: number, cy: number, k: number, wide: number): Point[] => [[-10, 0], [-6, -3.5], [0, -4.5], [6, -3.5], [10, 0], [6, 3.5], [0, 4.5], [-6, 3.5]]
  .map(([x, y]): Point => [cx + x * k * wide, cy + y * k]);
const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

export function syntheticBust(scale = 1, wide = 1): SyntheticBust {
  const k = scale, width = Math.round(160 * k), height = Math.round(224 * k), data = new Uint8ClampedArray(width * height * 4);
  const eyes: [Point[], Point[]] = [almond(62 * k, 78 * k, k, wide), almond(98 * k, 78 * k, k, wide)];
  const paint = (x: number, y: number, c: Colour) => { const i = (y * width + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = (x + 0.5) / k, py = (y + 0.5) / k;
    let colour: Colour | null = null;
    if (inEllipse(px, py, 80, 205, 62, 50)) colour = SHIRT;
    if (px >= 70 && px <= 90 && py >= 118 && py <= 152) colour = SKIN;
    if (inEllipse(px, py, 36, 86, 4, 9) || inEllipse(px, py, 124, 86, 4, 9)) colour = SKIN_DARK;
    if (inEllipse(px, py, 80, 80, 44, 52)) colour = SKIN;
    if (inEllipse(px, py, 80, 70, 47, 50) && py < 62) colour = HAIR;
    if (inEllipse(px, py, 80, 94, 2, 3)) colour = SKIN_DARK;
    if (inEllipse(px, py, 80, 110.5, 10, 1.6)) colour = LIP;
    for (const bx of [62, 98]) if (Math.abs(px - bx) <= 7 && Math.abs(py - 66) <= 1.5) colour = HAIR;
    for (const [index, cx] of [62, 98].entries()) {
      const eye = eyes[index], dx = (px - cx) / wide, dy = py - 78;
      if (Math.abs(dx) <= 10 && dy < 0 && dy >= -4.5 * (1 - (dx / 10) ** 2) - 1.4 && !inPolygon(eye.map(([ex, ey]): Point => [ex / k, ey / k]), px, py)) colour = LASH;
      if (inPolygon(eye.map(([ex, ey]): Point => [ex / k, ey / k]), px, py)) colour = Math.hypot(px - cx, dy) <= 1.8 ? PUPIL : Math.hypot(px - cx, dy) <= 4 ? IRIS : WHITE;
    }
    if (colour) paint(x, y, colour);
  }
  const p = (x: number, y: number): Point => [x * k, y * k];
  return { image: { width, height, data }, landmarks: { version: LANDMARK_VERSION, image: { width, height }, face: { cx: 80 * k, cy: 80 * k, rx: 44 * k, ry: 52 * k },
    eyes, brows: [p(62, 66), p(98, 66)], nose: p(80, 94), mouth: { left: p(70, 110), right: p(90, 110), top: p(80, 108.5), bottom: p(80, 112.5) },
    chin: p(80, 131), neck: p(80, 142), shoulders: [p(48, 160), p(112, 160)], ears: [p(36, 86), p(124, 86)] } };
}

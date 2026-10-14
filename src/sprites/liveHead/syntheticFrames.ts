import type { PixelImage } from "../builder/pixels";
import type { Rig } from "./types";
import { insidePolygon as inside } from "./synthesis/layers";

type Colour = [number, number, number];
const LASH: Colour = [32, 22, 22], MOUTH: Colour = [84, 22, 30], TONGUE: Colour = [196, 98, 104];

const sampled = (values: number[], u: number): number => {
  const f = Math.min(1, Math.max(0, u)) * 23, i = Math.min(Math.floor(f), 22);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
};

function patch(art: PixelImage, rect: [number, number, number, number], paint: (x: number, y: number) => Colour | null): PixelImage {
  const data = new Uint8ClampedArray(art.data.length), [rx, ry, rw, rh] = rect;
  for (let y = Math.max(0, ry); y < Math.min(art.height, ry + rh); y++) for (let x = Math.max(0, rx); x < Math.min(art.width, rx + rw); x++) {
    const offset = (y * art.width + x) * 4, edge = Math.min(1, Math.min(x - rx + 0.5, y - ry + 0.5, rx + rw - x - 0.5, ry + rh - y - 0.5) / 2);
    const colour = paint(x + 0.5, y + 0.5);
    for (let channel = 0; channel < 3; channel++) data[offset + channel] = colour ? colour[channel] : art.data[offset + channel];
    data[offset + 3] = Math.round(art.data[offset + 3] * edge);
  }
  return { width: art.width, height: art.height, data };
}

export type SyntheticFrames = Record<"blink" | "talk" | "talk2" | "mouth_o" | "mouth_wide", PixelImage>;

export function syntheticFrames(art: PixelImage, rig: Rig): SyntheticFrames {
  const cheek = rig.cheeks[0], at = (Math.round(cheek[1]) * art.width + Math.round(cheek[0])) * 4;
  const skin: Colour = [art.data[at], art.data[at + 1], art.data[at + 2]];
  const xs = rig.eyes.flatMap((eye) => eye.roi.map((point) => point[0])), ys = rig.eyes.flatMap((eye) => eye.roi.map((point) => point[1]));
  const margin = Math.max(4, Math.round((Math.max(...ys) - Math.min(...ys)) * 0.35)) + 2;
  const eyeRect: [number, number, number, number] = [Math.floor(Math.min(...xs)) - margin, Math.floor(Math.min(...ys)) - margin,
    Math.ceil(Math.max(...xs) - Math.min(...xs)) + 2 * margin, Math.ceil(Math.max(...ys) - Math.min(...ys)) + 2 * margin];
  const blink = patch(art, eyeRect, (x, y) => {
    for (const eye of rig.eyes) {
      if (!inside(eye.roi, x, y)) continue;
      const u = (x - eye.x0) / (eye.x1 - eye.x0), top = sampled(eye.top, u), bot = sampled(eye.bot, u), line = bot - (bot - top) * 0.3;
      return Math.abs(y - line) <= 1 && u > 0.02 && u < 0.98 ? LASH : skin;
    }
    return null;
  });
  const area = rig.mouth.area, mouthRect: [number, number, number, number] = [Math.floor(area.cx - area.rx * 1.8), Math.floor(area.cy - area.ry * 1.6),
    Math.ceil(area.rx * 3.6), Math.ceil(area.ry * 3.2)];
  const mouth = (open: number, width = 0.95) => patch(art, mouthRect, (x, y) => {
    const dx = (x - rig.mouth.cx) / (rig.mouth.halfLen * width), dy = (y - rig.mouth.cy - open * 0.35) / open;
    const d = dx * dx + dy * dy;
    if (d <= 1) return dy > 0.35 && Math.abs(dx) < 0.55 ? TONGUE : MOUTH;
    return d <= 1.25 ? skin : null;
  });
  return { blink, talk: mouth(Math.max(3, area.ry * 0.7)), talk2: mouth(Math.max(2, area.ry * 0.38)),
    mouth_o: mouth(Math.max(3, area.ry * 0.6), 0.55), mouth_wide: mouth(Math.max(2, area.ry * 0.3), 1.1) };
}

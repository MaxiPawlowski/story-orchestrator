import type { EditKind } from "./recipes";

export interface PixelImage { width: number; height: number; data: Uint8ClampedArray; sha256?: string }
export interface HeadBox { x: number; y: number; width: number; height: number }
export interface PixelQA { ok: boolean; reasons: string[]; changed: number; alphaPixels: number; ringDrift: number }

export function validateBox(image: Pick<PixelImage, "width" | "height">, box: HeadBox): void {
  if (!Object.values(box).every(Number.isInteger) || box.x < 0 || box.y < 0 || box.width < 8 || box.height < 8
    || box.x + box.width > image.width || box.y + box.height > image.height) throw new Error("The head box must fit inside the reference image.");
}

export function pasteEdit(base: PixelImage, edit: PixelImage, box: HeadBox, kind: EditKind): PixelImage {
  validateBox(base, box);
  if (edit.width !== box.width || edit.height !== box.height) throw new Error("Resize the edit to the reference head box before compositing.");
  const frame = kind === "blink" || kind === "talk" || kind === "talk2";
  const data = frame ? new Uint8ClampedArray(base.data.length) : new Uint8ClampedArray(base.data);
  const low = kind === "blink" ? 0.12 : kind === "talk" || kind === "talk2" ? 0.55 : 0;
  const high = kind === "blink" ? 0.55 : 1;
  for (let y = 0; y < box.height; y += 1) for (let x = 0; x < box.width; x += 1) {
    const distance = Math.sqrt(((x + 0.5 - box.width / 2) / (box.width / 2)) ** 2 + ((y + 0.5 - box.height / 2) / (box.height / 2)) ** 2);
    const edge = Math.min(1, Math.max(0, (1 - distance) / 0.12));
    const band = Math.min(1, Math.max(0, (y / box.height - low) / 0.04), Math.max(0, (high - y / box.height) / 0.04));
    const weight = edge * band;
    if (!weight) continue;
    const target = ((box.y + y) * base.width + box.x + x) * 4, source = (y * edit.width + x) * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      data[target + channel] = frame ? edit.data[source + channel] : Math.round(base.data[target + channel] * (1 - weight) + edit.data[source + channel] * weight);
    }
    data[target + 3] = frame ? Math.round(base.data[target + 3] * weight) : base.data[target + 3];
  }
  return { width: base.width, height: base.height, data };
}

export function checkPixels(base: PixelImage, output: PixelImage, box: HeadBox, frame = false): PixelQA {
  validateBox(base, box);
  const reasons: string[] = [];
  if (base.width !== output.width || base.height !== output.height || output.data.length !== base.data.length) {
    return { ok: false, reasons: ["Output dimensions changed."], changed: 0, alphaPixels: 0, ringDrift: 0 };
  }
  let changed = 0, alphaPixels = 0, ringDrift = 0, ringCount = 0, opaque = 0, alphaChanged = false;
  const colours = new Set<number>();
  for (let y = 0; y < base.height; y += 1) for (let x = 0; x < base.width; x += 1) {
    const offset = (y * base.width + x) * 4;
    if (output.data[offset + 3] > 8) {
      opaque += 1;
      colours.add((output.data[offset] << 16) | (output.data[offset + 1] << 8) | output.data[offset + 2]);
    } else alphaPixels += 1;
    const inside = x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
    const delta = Math.max(...[0, 1, 2].map((channel) => Math.abs(base.data[offset + channel] - output.data[offset + channel])));
    if (inside && output.data[offset + 3] > 8 && delta > 4) changed += 1;
    if (!inside && !frame) { ringDrift += delta; ringCount += 1; }
    if (!frame && output.data[offset + 3] !== base.data[offset + 3]) alphaChanged = true;
  }
  ringDrift /= Math.max(1, ringCount);
  if (alphaChanged) reasons.push("Reference alpha changed.");
  if (!alphaPixels || !opaque) reasons.push("The image needs a non-empty transparent cutout.");
  if (colours.size < 8) reasons.push("The image is blank or nearly single-colour.");
  if (changed < 5) reasons.push("The requested edit is not visibly different.");
  if (ringDrift >= 14) reasons.push("Pixels outside the edit box drifted.");
  return { ok: !reasons.length, reasons: [...new Set(reasons)], changed, alphaPixels, ringDrift };
}

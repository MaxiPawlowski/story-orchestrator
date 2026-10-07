import type { HeadBox } from "./pixels";

export interface FrameRegion extends HeadBox { feather: number }

export function mouthRegion(box: Pick<HeadBox, "width" | "height">): FrameRegion {
  const width = Math.max(3, Math.round(box.width * 0.36));
  const height = Math.max(3, Math.round(box.height * 0.2));
  return { x: Math.floor((box.width - width) / 2), y: Math.ceil(box.height * 0.52), width, height,
    feather: Math.max(1, Math.min(Math.round(Math.min(box.width, box.height) * 0.01), Math.floor(Math.min(width, height) / 2))) };
}

export function validateRegion(box: Pick<HeadBox, "width" | "height">, region: FrameRegion): void {
  if (![region.x, region.y, region.width, region.height, region.feather].every(Number.isInteger)
    || region.x < 0 || region.y < 0 || region.width < 3 || region.height < 3
    || region.x + region.width > box.width || region.y + region.height > box.height
    || region.feather < 0 || region.feather * 2 >= Math.min(region.width, region.height)) {
    throw new Error("Keep the mouth region inside the head box, with a smaller feather than its replacement area.");
  }
}

export function regionWeight(x: number, y: number, region: FrameRegion): number {
  const inset = Math.min(x + 0.5 - region.x, region.x + region.width - x - 0.5,
    y + 0.5 - region.y, region.y + region.height - y - 0.5);
  return inset <= 0 ? 0 : region.feather === 0 ? 1 : Math.min(1, inset / region.feather);
}

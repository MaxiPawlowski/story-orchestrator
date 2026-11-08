import { DEPTH_MODEL, type DepthModel } from "./graph";

export { DEPTH_MODEL, type DepthModel };
export const DEPTH_FOLDER = "so-backdrop-depth";
export const DEPTH_UPLOAD_MAX = 1024;

const HEX = /^[a-f0-9]{64}$/;

export function depthCacheKey(contentHash: string, model: DepthModel = DEPTH_MODEL): string {
  if (!HEX.test(contentHash)) throw new Error("A depth key needs the background's sha256.");
  return `${contentHash.slice(0, 32)}-${model.id}-r${model.resolution}-v${model.version}`;
}

export const depthPath = (key: string): string => `user/images/${DEPTH_FOLDER}/${key}.png`;

export function uploadSize(width: number, height: number, max = DEPTH_UPLOAD_MAX): { width: number; height: number } {
  if (!(width > 0 && height > 0)) throw new Error("The background has no size.");
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

import { FRAME_KEYS, type AnimationFrames } from "../frameKeys";
import type { DrawnSource } from "../liveHead/drawn";

export function publishedFrames(base: string, frames: AnimationFrames | undefined): DrawnSource | undefined {
  const listed = FRAME_KEYS.flatMap((key) => frames?.[key] ? [[key, base + frames[key]] as const] : []);
  return listed.length ? { frames: Object.fromEntries(listed) } : undefined;
}

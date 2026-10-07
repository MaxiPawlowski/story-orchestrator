import type { AnimationFrames } from "../animation";

export const LOOK_CONTRACT = 2;
export const LOOK_FRAME_KINDS = ["blink", "talk"] as const;

export interface LookFrameDeps {
  guard(): void;
  wait(): Promise<void>;
  cached(kind: typeof LOOK_FRAME_KINDS[number]): Promise<string | null>;
  render(kind: typeof LOOK_FRAME_KINDS[number]): Promise<string>;
}

export async function completeLookFrames(deps: LookFrameDeps): Promise<AnimationFrames> {
  const frames: AnimationFrames = {};
  for (const kind of LOOK_FRAME_KINDS) {
    deps.guard();
    const cached = await deps.cached(kind);
    deps.guard();
    if (cached) { frames[kind] = cached; continue; }
    await deps.wait();
    deps.guard();
    const path = await deps.render(kind);
    deps.guard();
    frames[kind] = path;
  }
  return frames;
}

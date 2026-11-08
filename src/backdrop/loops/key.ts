import { sha256Hex } from "@utils/sha256";
import { LOOP_MODEL, LOOP_PROMPT_VERSION, LOOP_SHAPE, type LoopShape } from "./workflow";

export const loopKeyText = (contentHash: string, prompt: string, shape: LoopShape = LOOP_SHAPE): string =>
  [contentHash, LOOP_MODEL.id, `p${LOOP_PROMPT_VERSION}`, `${shape.width}x${shape.height}x${shape.frames}@${shape.fps}b${shape.blend}s${shape.steps}`, prompt].join("|");

export async function loopKey(contentHash: string, prompt: string, shape: LoopShape = LOOP_SHAPE): Promise<string> {
  return (await sha256Hex(new TextEncoder().encode(loopKeyText(contentHash, prompt, shape)))).slice(0, 32);
}

export const loopSeed = (key: string): number => parseInt(key.slice(0, 8), 16) % 2_147_483_647;

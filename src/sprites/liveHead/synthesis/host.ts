import { fetchHarnessStatus, sendHarnessRequest } from "@services/stHost/harness";
import { headAssetBytes } from "@services/stHost/liveHeadAssets";
import type { PixelImage } from "../../builder/pixels";
import { contentHash } from "../../builder/recipes";
import { encodeImage } from "../../builder/images";
import { VISION_RIG_MODEL } from "../visionRequest";
import { visionLandmarkProvider } from "./visionLandmarks";
import type { LandmarkProvider, RigSynthesisDeps } from "./synthesize";

export async function decodeBytes(bytes: Uint8Array, signal: AbortSignal): Promise<PixelImage> {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  try {
    signal.throwIfAborted();
    if (bitmap.width * bitmap.height > 16_777_216) throw new Error("The bust is too large.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot read bust pixels.");
    context.drawImage(bitmap, 0, 0);
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
  } finally { bitmap.close(); }
}

export const solLandmarks: LandmarkProvider = visionLandmarkProvider({
  target: async (signal) => {
    const status = await fetchHarnessStatus();
    signal.throwIfAborted();
    const row = status?.harnesses.opencode;
    return row?.offered ? row.models.find((model) => model.id === VISION_RIG_MODEL && model.image && model.available !== false) : undefined;
  },
  send: sendHarnessRequest,
});

export function rigSynthesisDeps(landmarks: LandmarkProvider = solLandmarks): RigSynthesisDeps {
  return {
    landmarks,
    read: async (source, signal) => new Uint8Array(await headAssetBytes(source, signal)),
    hash: contentHash,
    decode: decodeBytes,
    encode: async (image) => encodeImage(image),
  };
}

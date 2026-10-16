import { headAssetBytes } from "@services/stHost/liveHeadAssets";
import { contentHash } from "../../builder/recipes";
import { encodeImage } from "../../builder/images";
import { visionLandmarkProvider, visionTarget } from "./visionLandmarks";
import { decodeBytes } from "./decode";
import { detectorChecker, type LandmarkChecker } from "./detectorCheck";
import type { LandmarkProvider, RigSynthesisDeps } from "./synthesize";

export const solLandmarks: LandmarkProvider = visionLandmarkProvider({
  target: async (signal) => {
    const { fetchHarnessStatus } = await import("@services/stHost/harness");
    const status = await fetchHarnessStatus() ?? await fetchHarnessStatus(true);
    signal.throwIfAborted();
    return visionTarget(status);
  },
  send: async (request) => (await import("@services/stHost/harness")).sendHarnessRequest(request),
});

export const detectorLandmarkCheck: LandmarkChecker = detectorChecker(async (png, signal) => (await import("@services/stHost/landmarkDetector")).detectFaceLandmarks(png, signal));

export function rigSynthesisDeps(landmarks: LandmarkProvider = solLandmarks, check: LandmarkChecker = detectorLandmarkCheck): RigSynthesisDeps {
  return {
    landmarks,
    check,
    read: async (source, signal) => new Uint8Array(await headAssetBytes(source, signal)),
    hash: contentHash,
    decode: decodeBytes,
    encode: async (image) => encodeImage(image),
  };
}

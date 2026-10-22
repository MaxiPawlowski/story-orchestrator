import { comfyReference, comfyReleaseReference, comfyRenderOwned, saveGeneratedSprite } from "@services/stHost/media";
import { eyeBoxes, eyeOpenness, faceCount } from "./eyeOpen";
import { reserveGpu, releaseGpu, renewGpu } from "@services/stHost/gpuBroker";
import { hostGenerating, leaseOutsideTurns } from "./textPriority";
import type { RunOwnership } from "@runtime/runToken";
import { SpriteBuilder } from "./builder";
import { decodeImage, encodeImage, cropReference, resizeEdit } from "./images";
import { BASE_RECIPE, EDIT_RECIPE, REST_RECIPE, POSE_RECIPE, POSE_FALLBACK_RECIPE, DECAL_RECIPE } from "./recipes";
import { log } from "@utils/log";
import { isFrameKey } from "../frameKeys";
import { activeSpriteBatch } from "./batchSlot";
import { getGlobalSettings } from "@runtime/settingsStore";
import { verifyVisualSource, sourceStillCurrent } from "../visualHost";
import { visualRoot } from "../visualManifest";
import { busyWork } from "@runtime/busy";

export function createSpriteBuilder(ownership: RunOwnership): SpriteBuilder {
  return new SpriteBuilder({
    ownership, decode: decodeImage, encode: encodeImage, crop: cropReference, resize: resizeEdit,
    eyes: async (image, signal) => {
      const reply = await (await import("@services/stHost/landmarkDetector")).detectFaceLandmarks(encodeImage(image), signal);
      return reply.ok ? { boxes: eyeBoxes(reply.result, image), openness: eyeOpenness(reply.result), faces: faceCount(reply.result) } : null;
    },
    lineage: async (request, signal) => {
      const source = getGlobalSettings().sprites.visualSources[request.character];
      if (!source) return null;
      await verifyVisualSource(source, signal);
      return { root: visualRoot(source), current: () => sourceStillCurrent(source) };
    },
    uploadReference: comfyReference, render: async (...args) => {
      const busy = busyWork.begin("sprite", ownership.mint().chatId);
      try { return await comfyRenderOwned(...args); } finally { busy.end(); }
    },
    releaseReference: async (name) => {
      const result = await comfyReleaseReference(name);
      if (!result.ok) log.warn(result.reason);
    },
    lease: async (request, signal) => {
      const resolution = request.resolution ?? 1024;
      const ratio = request.box.width / request.box.height;
      const width = Math.max(32, Math.round(Math.sqrt(resolution ** 2 * ratio) / 32) * 32);
      const height = Math.max(32, Math.round(Math.sqrt(resolution ** 2 / ratio) / 32) * 32);
      const gpuRequest = { signal, width, height,
        workflowKey: JSON.stringify({ recipe: request.kind === "pose" ? (request.poseRoute === "p3" ? POSE_FALLBACK_RECIPE : POSE_RECIPE) : request.kind === "base" ? BASE_RECIPE : EDIT_RECIPE,
          family: request.kind === "base" || request.kind === "look" ? request.kind : "face", width, height, cutout: request.cutout }),
        modelFiles: [
          { kind: "diffusionModels", name: request.models.diffusion.name },
          { kind: "textEncoders", name: request.models.encoder.name },
          { kind: "vaes", name: request.models.vae.name },
         ] };
      const reserve = () => leaseOutsideTurns({ acquire: () => reserveGpu(gpuRequest), release: async (held) => { if (held.lease) await releaseGpu(held.lease); },
        loud: hostGenerating, sleep: () => new Promise((resolve) => setTimeout(resolve, 500)), signal });
      const acquire = async () => {
      const reservation = await reserve();
      const timer = reservation.lease ? setInterval(() => { void renewGpu(reservation.lease).then((result) => {
        if (!result.ok) log.warn(result.reason);
      }).catch(() => {}); }, 30_000) : null;
      return { renew: async () => { const result = await renewGpu(reservation.lease); if (!result.ok) throw new Error(result.reason); }, release: async () => {
        if (timer) clearInterval(timer);
        const result = await releaseGpu(reservation.lease);
        if (!result.ok) throw new Error(result.reason);
      } };
      };
      const batch = activeSpriteBatch();
      return batch ? batch.acquire(gpuRequest.workflowKey, acquire) : acquire();
    },
    save: async (candidate, expectedHash) => {
      const { character, set, label, kind } = candidate.request;
      const frame = isFrameKey(kind);
      const result = await saveGeneratedSprite({ character, set: frame ? `anim-${set}` : set, label: frame ? `${label}.${kind}` : label,
        data: candidate.data, key: candidate.key,
        recipe: kind === "pose" ? (candidate.request.poseRoute === "p3" ? POSE_FALLBACK_RECIPE : POSE_RECIPE)
          : kind === "decal" ? DECAL_RECIPE : kind === "base" ? BASE_RECIPE : kind === "rest" ? REST_RECIPE : EDIT_RECIPE,
        qa: candidate.qa, inputs: candidate.inputs, expectedHash });
      if (!result.ok) throw new Error(result.reason);
      return { path: result.path, sha256: result.sha256 };
    },
  });
}

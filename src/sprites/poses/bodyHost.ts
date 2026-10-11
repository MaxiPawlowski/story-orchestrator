import type { RunOwnership } from "@runtime/runToken";
import { comfyDiscover, comfyFingerprint, spriteManifest, spriteReferencePack } from "@services/stHost/media";
import { gpuBrokerStatus } from "@services/stHost/gpuBroker";
import { createSpriteBuilder } from "../builder/host";
import { decodeImage, encodeImage } from "../builder/images";
import { DWPOSE_FILES, headToHipRatio } from "./import";
import { importPoseImage } from "./importHost";
import { waitForTextPriority } from "../builder/textPriority";
import { PoseBodies } from "./bodyRenderer";

export const createPoseBodies = (ownership: RunOwnership): PoseBodies => new PoseBodies({
  ownership, builder: () => createSpriteBuilder(ownership), discover: comfyDiscover, pack: spriteReferencePack, manifest: spriteManifest, decode: decodeImage,
  models: async (config, signal) => {
    const [diffusion, encoder, vae] = await Promise.all([comfyFingerprint("diffusionModels", config.models.diffusion, signal), comfyFingerprint("textEncoders",
      config.models.encoder, signal), comfyFingerprint("vaes", config.models.vae, signal)]);
    return { diffusion, encoder, vae };
  },
  wait: (signal, current) => waitForTextPriority({ signal, current, status: gpuBrokerStatus, now: Date.now, sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) }),
  proportions: async (image, discovery, signal) => {
    if (!discovery.nodes.DWPreprocessor) return undefined;
    try { for (const name of DWPOSE_FILES) await comfyFingerprint("poseModels", name, signal); }
    catch { signal.throwIfAborted(); return undefined; }
    signal.throwIfAborted();
    return headToHipRatio(await importPoseImage(encodeImage(image), ownership));
  },
});

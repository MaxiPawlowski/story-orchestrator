import type { RunOwnership } from "@runtime/runToken";
import { comfyDiscover, comfyFingerprint, spriteManifest, spriteReferencePack, type ComfyDiscovery } from "@services/stHost/media";
import { gpuBrokerStatus } from "@services/stHost/gpuBroker";
import { createSpriteBuilder } from "../builder/host";
import { decodeImage, encodeImage } from "../builder/images";
import type { PixelImage } from "../builder/pixels";
import { DWPOSE_FILES, NO_PERSON } from "./import";
import { importPoseImage } from "./importHost";
import { hostGenerating, waitForTextPriority } from "../builder/textPriority";
import { PoseBodies } from "./bodyRenderer";
import { getGlobalSettings } from "@runtime/settingsStore";
import { publishedLook, visualRoot } from "../visualManifest";
import { verifyVisualSource, sourceStillCurrent, publishDerivedVisual } from "../visualHost";

export const createPoseBodies = (ownership: RunOwnership): PoseBodies => {
  const measure = async (image: PixelImage, discovery: ComfyDiscovery, signal: AbortSignal, none: null | undefined) => {
    if (!discovery.nodes.DWPreprocessor) return undefined;
    try { for (const name of DWPOSE_FILES) await comfyFingerprint("poseModels", name, signal); }
    catch { signal.throwIfAborted(); return undefined; }
    signal.throwIfAborted();
    try { return await importPoseImage(encodeImage(image), ownership, signal); }
    catch (error) { signal.throwIfAborted(); return NO_PERSON.test(error instanceof Error ? error.message : String(error)) ? none : undefined; }
  };
  return new PoseBodies({
  ownership, builder: () => createSpriteBuilder(ownership), discover: comfyDiscover, pack: spriteReferencePack, manifest: spriteManifest, decode: decodeImage,
  lineage: async (folder, signal) => {
    const source = getGlobalSettings().sprites.visualSources[folder];
    if (!source) return undefined;
    await verifyVisualSource(source, signal);
    return { root: visualRoot(source), baseSet: source.baseSet, current: () => sourceStillCurrent(source) };
  },
  published: (folder, root, fields) => {
    const source = getGlobalSettings().sprites.visualSources[folder];
    return source && visualRoot(source) === root ? publishedLook(source, fields) : null;
  },
  publishLook: publishDerivedVisual,
  models: async (config, signal) => {
    const [diffusion, encoder, vae] = await Promise.all([comfyFingerprint("diffusionModels", config.models.diffusion, signal), comfyFingerprint("textEncoders",
      config.models.encoder, signal), comfyFingerprint("vaes", config.models.vae, signal)]);
    return { diffusion, encoder, vae };
  },
  wait: (signal, current) => waitForTextPriority({ signal, current, status: gpuBrokerStatus, loud: hostGenerating, now: Date.now, sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) }),
  proportions: async (image, discovery, signal) => (await measure(image, discovery, signal, undefined)) ?? undefined,
  head: (image, discovery, signal) => measure(image, discovery, signal, null),
  });
};

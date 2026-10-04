import { comfyReference, comfyRenderOwned, saveGeneratedSprite } from "@services/stHost/media";
import { reserveGpu, releaseGpu, renewGpu } from "@services/stHost/gpuBroker";
import type { RunOwnership } from "@runtime/runToken";
import { SpriteBuilder } from "./builder";
import { decodeImage, encodeImage, cropReference, resizeEdit } from "./images";
import { EDIT_RECIPE } from "./recipes";
import { log } from "@utils/log";

export function createSpriteBuilder(ownership: RunOwnership): SpriteBuilder {
  return new SpriteBuilder({
    ownership, decode: decodeImage, encode: encodeImage, crop: cropReference, resize: resizeEdit,
    uploadReference: comfyReference, render: comfyRenderOwned,
    lease: async (request, signal) => {
      const reservation = await reserveGpu({ signal, width: 1024, height: 1024,
        workflowKey: `qwen21-${request.models.diffusion.name}@1024`,
        modelFiles: [
          { kind: "diffusionModels", name: request.models.diffusion.name },
          { kind: "textEncoders", name: request.models.encoder.name },
          { kind: "vaes", name: request.models.vae.name },
        ] });
      const timer = reservation.lease ? setInterval(() => { void renewGpu(reservation.lease).then((result) => {
        if (!result.ok) log.warn(result.reason);
      }).catch(() => {}); }, 30_000) : null;
      return { release: async () => {
        if (timer) clearInterval(timer);
        const result = await releaseGpu(reservation.lease);
        if (!result.ok) throw new Error(result.reason);
      } };
    },
    save: async (candidate, expectedHash) => {
      const { character, set, label, kind } = candidate.request;
      const frame = ["blink", "talk", "talk2"].includes(kind);
      const result = await saveGeneratedSprite({ character, set: frame ? `anim-${set}` : set, label: frame ? `${label}.${kind}` : label,
        data: candidate.data, key: candidate.key, recipe: EDIT_RECIPE, qa: candidate.qa, inputs: candidate.inputs, expectedHash });
      if (!result.ok) throw new Error(result.reason);
      return { path: result.path, sha256: result.sha256 };
    },
  });
}

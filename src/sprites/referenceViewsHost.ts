import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import type { RunOwnership } from "@runtime/runToken";
import { comfyDiscover, comfyFingerprint, comfyReference, comfyReleaseReference, comfyRenderOwned, saveGeneratedSprite } from "@services/stHost/media";
import { spriteVisualCardPresent } from "@services/stHost/sprites";
import { reserveGpu, releaseGpu, renewGpu, gpuBrokerStatus } from "@services/stHost/gpuBroker";
import { log } from "@utils/log";
import { builderRender } from "./settings";
import { withDefaultBuilders } from "./defaultRecipe";
import { contentHash, editGraph, recipeProblems } from "./builder/recipes";
import { decodeImage, encodeImage } from "./builder/images";
import { referenceProblems } from "./builder/referencePack";
import { waitForTextPriority } from "./builder/textPriority";
import { verifyVisualSource } from "./visualHost";
import { visualSourceAccepted } from "./visualChanges";
import { REFERENCE_VIEW_RECIPE, REFERENCE_VIEW_SEED, ReferencePackSession, type ViewJob, type ViewRoute } from "./referenceViews";
import type { VisualManifest } from "./visualManifest";

const textHash = (value: string): Promise<string> => contentHash(new TextEncoder().encode(value));
const dataHash = (data: string): Promise<string> => contentHash(Uint8Array.from(atob(data), (char) => char.charCodeAt(0)));

async function viewRoute(character: string, signal: AbortSignal): Promise<ViewRoute> {
  const config = withDefaultBuilders(getGlobalSettings().sprites).builders[character];
  if (!config) throw new Error("Configure this character's Qwen edit route under Prepare presentation first.");
  const discovery = await comfyDiscover(signal), problems = recipeProblems(discovery, config.models);
  if (problems.length) throw new Error(problems.join(" "));
  const cutout = discovery.alpha?.[0];
  if (!cutout) throw new Error("Reference views need the BiRefNet cutout node for a transparent background.");
  const [diffusion, encoder, vae] = await Promise.all([comfyFingerprint("diffusionModels", config.models.diffusion, signal),
    comfyFingerprint("textEncoders", config.models.encoder, signal), comfyFingerprint("vaes", config.models.vae, signal)]);
  return { models: { diffusion, encoder, vae }, ...builderRender(config), cutout };
}

async function openViews(source: VisualManifest, route: ViewRoute, signal: AbortSignal): Promise<ViewJob> {
  await waitForTextPriority({ status: gpuBrokerStatus, current: () => !signal.aborted, signal, now: Date.now,
    sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) });
  signal.throwIfAborted();
  const lease = await reserveGpu({ workflowKey: JSON.stringify({ recipe: REFERENCE_VIEW_RECIPE, resolution: route.resolution, cutout: route.cutout.id }),
    width: route.resolution, height: route.resolution, signal,
    modelFiles: [{ kind: "diffusionModels", name: route.models.diffusion.name }, { kind: "textEncoders", name: route.models.encoder.name }, { kind: "vaes", name: route.models.vae.name }] });
  const heartbeat = setInterval(() => { void renewGpu(lease.lease).then((result) => { if (!result.ok) log.warn(result.reason); }).catch(() => {}); }, 60_000);
  let reference: string | null = null;
  const close = async () => {
    clearInterval(heartbeat);
    if (reference) { const released = await comfyReleaseReference(reference); if (!released.ok) log.warn(released.reason); reference = null; }
    const freed = await releaseGpu(lease.lease);
    if (!freed.ok) log.warn(freed.reason);
  };
  try {
    const image = await decodeImage(source.base.path);
    signal.throwIfAborted();
    if (image.sha256 !== source.base.sha256) throw new Error("The accepted base changed before upload. Review presentation again.");
    reference = await comfyReference(encodeImage(image), signal, { character: source.character, set: `refpack_${source.id.slice(0, 16)}` });
  } catch (error) { await close(); throw error; }
  const uploaded = reference;
  return {
    close,
    render: async (_view, instruction, _key, viewSignal) => {
      const result = await comfyRenderOwned(editGraph({ models: route.models, steps: route.steps, seed: REFERENCE_VIEW_SEED, reference: uploaded, instruction,
        cutout: route.cutout, resolution: route.resolution }), viewSignal);
      viewSignal.throwIfAborted();
      const problems = referenceProblems(await decodeImage(`data:image/${result.format === "webp" ? "webp" : "png"};base64,${result.data}`));
      if (problems.length) throw new Error(problems.join(" "));
      return result.data;
    },
  };
}

export function createReferencePackSession(ownership: RunOwnership): ReferencePackSession {
  return new ReferencePackSession({
    ownership, read: (character) => getGlobalSettings().sprites.visualSources[character], present: spriteVisualCardPresent,
    verify: verifyVisualSource, route: viewRoute, open: openViews, hash: textHash, hashData: dataHash,
    save: async (character, set, candidate, signal) => {
      signal.throwIfAborted();
      const saved = await saveGeneratedSprite({ character, set, label: candidate.view, data: candidate.data, key: candidate.key, recipe: REFERENCE_VIEW_RECIPE,
        qa: { ok: true, authorReviewed: true }, expectedHash: candidate.sha256, inputs: { view: candidate.view }, signal });
      if (!saved.ok) throw new Error(saved.reason);
      return { path: saved.path, sha256: saved.sha256, key: candidate.key, recipe: { ...REFERENCE_VIEW_RECIPE } };
    },
    commit: (source, run) => {
      if (!run.stillOwns()) throw new Error("The draft changed before this reference pack could be accepted.");
      const settings = getGlobalSettings().sprites;
      setGlobalSettings({ sprites: { visualSources: { ...settings.visualSources, [source.character]: source } } });
      visualSourceAccepted();
    },
  });
}

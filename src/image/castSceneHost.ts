import { beginRun } from "@runtime/runToken";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { getGlobalSettings } from "@runtime/settingsStore";
import { cardValues, publicLook } from "@engine/cardFields";
import { comfyDiscover, comfyFingerprint, comfyReference, comfyReleaseReference, comfyRenderOwned, spriteFileFingerprint } from "@services/stHost/media";
import { spriteCast } from "@services/stHost/sprites";
import { imageChat, imageSave, imagePlace, imageDelete } from "@services/stHost/image";
import { reserveGpu, releaseGpu, renewGpu } from "@services/stHost/gpuBroker";
import { anySignal } from "@utils/signals";
import { verifyVisualSource, sourceStillCurrent } from "../sprites/visualHost";
import { contentHash, recipeProblems } from "../sprites/builder/recipes";
import { castSceneBuilder, castSceneGraph, castSceneIdentities, castSceneKey, CAST_SCENE_RECIPE } from "./castScene";
import { isNarratorMember } from "./cast";
import type { ImageQueue } from "./queue";
import { decodeImage, encodeImage } from "../sprites/builder/images";
import { waitForTextPriority } from "../sprites/builder/textPriority";
import { gpuBrokerStatus } from "@services/stHost/gpuBroker";
import { log } from "@utils/log";

async function discardUnplaced(path: string): Promise<void> {
  const removed = await imageDelete(path).catch((reason: unknown) => ({ ok: false as const, reason: reason instanceof Error ? reason.message : String(reason) }));
  if (!removed.ok) log.warn(`Cast scene image ${path} was not removed after a refusal: ${removed.reason}`);
}

export async function drawPreparedCast(manager: RuntimeManager, queue: ImageQueue, selected: string[], direction: string): Promise<string> {
  const run = beginRun(manager.getOwnership());
  let path: string | null = null;
  const refs: string[] = [];
  try {
    const chat = imageChat(), story = manager.getStory(), snapshot = manager.getCachedSnapshot(), cast = spriteCast();
    if (!chat || !story || !manager.ownsImageChat(chat.id)) throw new Error("Open the story's group before illustrating its cast.");
    const settings = getGlobalSettings().sprites;
    const members = selected.map((folder) => {
      const installed = cast.members.find((member) => member.folder === folder);
      const roster = story.roster.find((member) => (member.name ?? member.id) === installed?.name);
      if (!installed || !roster || isNarratorMember(roster)) throw new Error("Choose a present, non-narrator story member.");
      const source = settings.visualSources[folder];
      if (!source) throw new Error("Prepare each selected character's base and bust first.");
      return { character: folder, fields: cardValues(story, snapshot.blackboard, roster.id, true), source, card: roster.card };
    });
    const identities = castSceneIdentities(members);
    const config = castSceneBuilder(selected, settings.builders);
    const target = chat.messages.length ? chat.messages.length - 1 : null;
    const targetText = target === null ? null : chat.messages[target].mes;
    const guard = () => {
      const now = imageChat();
      if (!run.stillOwns() || !now || now.id !== chat.id || (target !== null && now.messages[target]?.mes !== targetText)
        || members.some((member) => !sourceStillCurrent(member.source))) throw new Error("The chat or accepted artwork changed. Request the cast scene again.");
      const current = manager.getCachedSnapshot();
      const currentMembers = members.map((member) => {
        const installed = spriteCast().members.find((row) => row.folder === member.character);
        const roster = story.roster.find((row) => (row.name ?? row.id) === installed?.name);
        if (!roster) throw new Error("The cast changed.");
        return { ...member, fields: cardValues(story, current.blackboard, roster.id, true), source: getGlobalSettings().sprites.visualSources[member.character], card: roster.card };
      });
      if (JSON.stringify(castSceneIdentities(currentMembers)) !== JSON.stringify(identities)) throw new Error("A current look changed while the cast scene was preparing.");
    };
    path = await queue.enqueue("Prepared cast · Qwen 2.1", async (queuedSignal) => {
      const signal = anySignal([run.signal, queuedSignal]);
      guard(); signal.throwIfAborted();
      for (const member of members) await verifyVisualSource(member.source, signal);
      for (const identity of identities) {
        if (await spriteFileFingerprint(identity.look.base.path, signal) !== identity.look.base.sha256) throw new Error("The current-look file changed. Prepare it again.");
      }
      const discovery = await comfyDiscover(signal), problems = recipeProblems(discovery, config.models);
      if (problems.length) throw new Error(problems.join(" "));
      if (identities.length === 2 && !discovery.nodes.TextEncodeQwenImage21?.input?.optional?.["images.image_2"]
        && !discovery.nodes.TextEncodeQwenImage21?.input?.required?.["images.image_2"]) throw new Error("This Qwen node does not offer the two-reference cast scene input.");
      const [diffusion, encoder, vae] = await Promise.all([comfyFingerprint("diffusionModels", config.models.diffusion, signal),
        comfyFingerprint("textEncoders", config.models.encoder, signal), comfyFingerprint("vaes", config.models.vae, signal)]);
      const render = { steps: config.steps, resolution: config.resolution };
      const prompt = [direction.trim() || "The selected characters together in the current scene.",
        ...members.map((member, index) => `Character ${index + 1}: ${publicLook(member.fields)}`
          + (identities[index].layered?.length ? ` (the reference image predates ${identities[index].layered?.join(", ")}; draw those details as described)` : ""))].join(" ");
      const input = { prompt, models: { diffusion, encoder, vae }, seed: 1234, ...render };
      const key = await contentHash(new TextEncoder().encode(castSceneKey(identities, input)));
      await waitForTextPriority({ status: gpuBrokerStatus, current: () => run.stillOwns(), signal,
        now: Date.now, sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) });
      guard(); signal.throwIfAborted();
      const lease = await reserveGpu({ workflowKey: key, width: render.resolution, height: render.resolution, signal,
        modelFiles: [{ kind: "diffusionModels", name: diffusion.name }, { kind: "textEncoders", name: encoder.name }, { kind: "vaes", name: vae.name }] });
      const heartbeat = setInterval(() => { void renewGpu(lease.lease); }, 60_000);
      try {
        for (const identity of identities) {
          const image = await decodeImage(identity.look.base.path);
          guard(); signal.throwIfAborted();
          if (image.sha256 !== identity.look.base.sha256) throw new Error("The identity image changed before upload.");
          refs.push(await comfyReference(encodeImage(image), signal));
        }
        const result = await comfyRenderOwned(castSceneGraph(refs, input), signal);
        guard(); signal.throwIfAborted();
        const saved = await imageSave(result.data, result.format, chat.folder, `cast_${key.slice(0, 16)}`);
        path = saved;
        guard(); signal.throwIfAborted();
        return saved;
      } finally {
        clearInterval(heartbeat);
        try { await Promise.all(refs.splice(0).map((ref) => comfyReleaseReference(ref))); }
        finally { await releaseGpu(lease.lease); }
      }
    });
    guard();
    const placed = await imagePlace(chat.id, target, "Prepared cast illustration", { url: path, type: "image", title: "Prepared cast illustration", source: "generated",
      image_director: { purpose: "cast-scene", recipe: CAST_SCENE_RECIPE, identities: identities.map((identity) => ({ character: identity.character,
        root: identity.root, signature: identity.signature, sha256: identity.look.base.sha256 })) } }, "inline");
    if (!placed.ok) throw new Error(placed.reason);
    return path;
  } catch (error) { if (path) await discardUnplaced(path); throw error; }
  finally { run.release(); }
}

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
import { contentHash, qwenImageInput, recipeProblems } from "../sprites/builder/recipes";
import { castSceneGraph, castSceneIdentities, castSceneKey, CastSetupGap, CAST_SCENE_RECIPE, CAST_TWO_REFERENCE_MISSING, discoveredSceneRecipe, LookPending,
  sceneRecipe, type CastSceneIdentity, type CastSceneMember, type CastScenePack } from "./castScene";
import { bindsPacks, visualRecord, type SceneSubject, type VisualScene } from "../sprites/packs/scene";
import { packKey } from "../sprites/packs/pack";
import { visualBridge } from "../sprites/packs/bridgeHost";
import { discoveryProblem } from "../sprites/defaultRecipe";
import { isNarratorMember } from "./cast";
import type { ImageQueue } from "./queue";
import { decodeImage, encodeImage } from "../sprites/builder/images";
import { hostGenerating, waitForTextPriority } from "../sprites/builder/textPriority";
import { gpuBrokerStatus } from "@services/stHost/gpuBroker";
import { log } from "@utils/log";

async function discardUnplaced(path: string): Promise<void> {
  const removed = await imageDelete(path).catch((reason: unknown) => ({ ok: false as const, reason: reason instanceof Error ? reason.message : String(reason) }));
  if (!removed.ok) log.warn(`Cast scene image ${path} was not removed after a refusal: ${removed.reason}`);
}

export const LOOK_WAIT_MS = 240_000;
export const PACK_CHANGED = "A visual pack or one of its files changed while the cast scene was preparing. Request the cast scene again.";
const PACK_RECIPE = { id: "visual-pack", version: 1 } as const;
type Story = NonNullable<ReturnType<RuntimeManager["getStory"]>>;

const rosterFor = (story: Story, cast: ReturnType<typeof spriteCast>, folder: string) => {
  const installed = cast.members.find((member) => member.folder === folder);
  const roster = story.roster.find((member) => (member.name ?? member.id) === installed?.name);
  if (!installed || !roster || isNarratorMember(roster)) throw new Error("Choose a present, non-narrator story member.");
  return roster;
};

function packLook(subject: SceneSubject | undefined): CastScenePack | undefined {
  if (!subject || subject.source !== "pack" || !subject.displayed || !subject.pack) return undefined;
  const root = `pack:${packKey(subject.pack)}`;
  return { root, substituted: subject.substituted,
    look: { root, signature: subject.substituted ? "[]" : subject.intended.signature, base: { ...subject.displayed.base, key: root, recipe: { ...PACK_RECIPE } } } };
}

function selectedMembers(story: Story, cast: ReturnType<typeof spriteCast>, selected: string[],
  blackboard: ReturnType<RuntimeManager["getCachedSnapshot"]>["blackboard"], visual: VisualScene | null): CastSceneMember[] {
  const sources = getGlobalSettings().sprites.visualSources;
  return selected.map((folder) => {
    const roster = rosterFor(story, cast, folder);
    const source = sources[folder], pack = packLook(visual?.subjects.find((subject) => subject.member === roster.id));
    const fields = cardValues(story, blackboard, roster.id, true);
    if (pack && (!pack.substituted || !source)) return { character: folder, fields, pack, card: roster.card };
    if (!source) throw new Error("Prepare each selected character's base and bust first, or bind a visual pack to them.");
    return { character: folder, fields, source, card: roster.card };
  });
}

async function packScene(manager: RuntimeManager, story: Story, cast: ReturnType<typeof spriteCast>, selected: string[], signal: AbortSignal): Promise<VisualScene | null> {
  if (!bindsPacks(story)) return null;
  const snapshot = manager.getCachedSnapshot();
  return visualBridge().scene({ story, members: selected.map((folder) => rosterFor(story, cast, folder).id), values: snapshot.blackboard,
    path: [...(manager.getEngineState?.()?.visitedPath ?? []), snapshot.activeCheckpointId ?? ""] }, { fresh: true, signal });
}

export async function settledLooks<M extends CastSceneMember>(read: () => M[], run: { stillOwns(): boolean }, waitMs = LOOK_WAIT_MS,
  sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 3_000)), now = Date.now): Promise<{ members: M[]; identities: CastSceneIdentity[] }> {
  const until = now() + waitMs;
  for (;;) {
    const members = read();
    try { return { members, identities: castSceneIdentities(members) }; } catch (error) {
      if (!(error instanceof LookPending) || now() >= until || !run.stillOwns()) throw error;
    }
    await sleep();
    if (!run.stillOwns()) throw new Error("The chat or accepted artwork changed. Request the cast scene again.");
  }
}

export async function drawPreparedCast(manager: RuntimeManager, queue: ImageQueue, selected: string[], direction: string): Promise<string> {
  const run = beginRun(manager.getOwnership());
  let path: string | null = null;
  let recipeSource = "";
  const refs: string[] = [];
  try {
    const chat = imageChat(), story = manager.getStory(), cast = spriteCast();
    if (!chat || !story || !manager.ownsImageChat(chat.id)) throw new Error("Open the story's group before illustrating its cast.");
    const settings = getGlobalSettings().sprites;
    const visual = await packScene(manager, story, cast, selected, run.signal);
    const { members, identities } = await settledLooks(() => selectedMembers(story, cast, selected, manager.getCachedSnapshot().blackboard, visual), run);
    const packed = members.some((member) => member.pack);
    const packsCurrent = async (signal: AbortSignal) => {
      if (visual && packed && !(await visualBridge().stillCurrent(visual, signal))) throw new Error(PACK_CHANGED);
    };
    const target = chat.messages.length ? chat.messages.length - 1 : null;
    const targetText = target === null ? null : chat.messages[target].mes;
    const guard = () => {
      const now = imageChat();
      if (!run.stillOwns() || !now || now.id !== chat.id || (target !== null && now.messages[target]?.mes !== targetText)
        || members.some((member) => member.source && !sourceStillCurrent(member.source))) throw new Error("The chat or accepted artwork changed. Request the cast scene again.");
      const current = manager.getCachedSnapshot();
      const currentMembers = members.map((member) => {
        const installed = spriteCast().members.find((row) => row.folder === member.character);
        const roster = story.roster.find((row) => (row.name ?? row.id) === installed?.name);
        if (!roster) throw new Error("The cast changed.");
        return { ...member, fields: cardValues(story, current.blackboard, roster.id, true), card: roster.card,
          ...(member.pack ? {} : { source: getGlobalSettings().sprites.visualSources[member.character] }) };
      });
      if (JSON.stringify(castSceneIdentities(currentMembers)) !== JSON.stringify(identities)) throw new Error("A current look changed while the cast scene was preparing.");
    };
    path = await queue.enqueue("Prepared cast · Qwen 2.1", async (queuedSignal) => {
      const signal = anySignal([run.signal, queuedSignal]);
      guard(); signal.throwIfAborted();
      for (const member of members) if (member.source) await verifyVisualSource(member.source, signal);
      for (const identity of identities) {
        if (identity.root.startsWith("pack:")) continue;
        if (await spriteFileFingerprint(identity.look.base.path, signal) !== identity.look.base.sha256) throw new Error("The current-look file changed. Prepare it again.");
      }
      await packsCurrent(signal);
      const discovery = await comfyDiscover(signal);
      const config = (() => {
        try { return sceneRecipe(selected, settings.builders, settings.sceneRecipe, discoveredSceneRecipe(discovery)); }
        catch (error) { throw new Error([error instanceof Error ? error.message : String(error), discoveryProblem(discovery)].filter(Boolean).join(" ")); }
      })();
      recipeSource = config.source;
      const problems = recipeProblems(discovery, config.models);
      if (problems.length) throw new Error(problems.join(" "));
      if (identities.length === 2 && !qwenImageInput(discovery, "image_2")) throw new CastSetupGap(CAST_TWO_REFERENCE_MISSING);
      const [diffusion, encoder, vae] = await Promise.all([comfyFingerprint("diffusionModels", config.models.diffusion, signal),
        comfyFingerprint("textEncoders", config.models.encoder, signal), comfyFingerprint("vaes", config.models.vae, signal)]);
      const render = { steps: config.steps, resolution: config.resolution };
      const prompt = [direction.trim() || "The selected characters together in the current scene.",
        ...members.map((member, index) => `Character ${index + 1}: ${publicLook(member.fields)}`
          + (identities[index].layered?.length ? ` (the reference image predates ${identities[index].layered?.join(", ")}; draw those details as described)` : ""))].join(" ");
      const input = { prompt, models: { diffusion, encoder, vae }, seed: 1234, ...render };
      const key = await contentHash(new TextEncoder().encode(castSceneKey(identities, input)));
      await waitForTextPriority({ status: gpuBrokerStatus, loud: hostGenerating, current: () => run.stillOwns(), signal,
        now: Date.now, sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) });
      guard(); signal.throwIfAborted();
      const lease = await reserveGpu({ workflowKey: key, width: render.resolution, height: render.resolution, signal, foreground: true,
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
        await packsCurrent(signal);
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
    await packsCurrent(run.signal);
    guard();
    const placed = await imagePlace(chat.id, target, "Prepared cast illustration", { url: path, type: "image", title: "Prepared cast illustration", source: "generated",
      image_director: { purpose: "cast-scene", recipe: CAST_SCENE_RECIPE, recipe_source: recipeSource, identities: identities.map((identity) => ({ character: identity.character,
        root: identity.root, signature: identity.signature, sha256: identity.look.base.sha256, ...(identity.layered ? { substituted: identity.layered } : {}) })),
        ...(visual ? { visual: visualRecord(visual) } : {}) } }, "inline");
    if (!placed.ok) throw new Error(placed.reason);
    return path;
  } catch (error) { if (path) await discardUnplaced(path); throw error; }
  finally { run.release(); }
}

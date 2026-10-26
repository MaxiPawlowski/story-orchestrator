import { beginRun } from "@runtime/runToken";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { getGlobalSettings } from "@runtime/settingsStore";
import { cardValues, publicLook } from "@engine/cardFields";
import type { PrimitiveValue, RosterMember } from "@engine/index";
import { comfyDiscover, comfyFingerprint, comfyReference, comfyReleaseReference, comfyRenderOwned, spriteFileFingerprint } from "@services/stHost/media";
import { spriteCast } from "@services/stHost/sprites";
import { imageChat, imageSave, imagePlace, imageDelete } from "@services/stHost/image";
import { reserveGpu, releaseGpu, renewGpu } from "@services/stHost/gpuBroker";
import { anySignal } from "@utils/signals";
import { verifyVisualSource, sourceStillCurrent } from "../sprites/visualHost";
import { contentHash, qwenImageInput, recipeProblems } from "../sprites/builder/recipes";
import { castSceneGraph, castSceneIdentities, castSceneKey, CastSetupGap, CAST_SCENE_RECIPE, CAST_TWO_REFERENCE_MISSING, discoveredSceneRecipe, LookPending, packGap,
  sceneRecipe, type CastSceneIdentity, type CastSceneMember, type CastScenePack } from "./castScene";
import { bindsPacks, visualRecord, type SceneFile, type SceneSubject, type VisualScene } from "../sprites/packs/scene";
import { packKey } from "../sprites/packs/pack";
import { visualBridge } from "../sprites/packs/bridgeHost";
import { discoveryProblem } from "../sprites/defaultRecipe";
import type { VisualSources } from "../sprites/visualManifest";
import { isNarratorMember } from "./cast";
import { illustratedReply, qwenOutputSize } from "./autoScene";
import type { ImageQueue } from "./queue";
import { decodeImage, encodeImage } from "../sprites/builder/images";
import { hostGenerating, leaseOutsideTurns, waitForTextPriority } from "../sprites/builder/textPriority";
import { gpuBrokerStatus } from "@services/stHost/gpuBroker";
import { log } from "@utils/log";
import { PLAYER_COPY } from "@runtime/narrative";

async function discardUnplaced(path: string): Promise<void> {
  const removed = await imageDelete(path).catch((reason: unknown) => ({ ok: false as const, reason: reason instanceof Error ? reason.message : String(reason) }));
  if (!removed.ok) log.warn(`Cast scene image ${path} was not removed after a refusal: ${removed.reason}`);
}

export const LOOK_WAIT_MS = 240_000;
export const PACK_CHANGED = "A visual pack or one of its files changed while the cast scene was preparing. Request the cast scene again.";
export const CAST_CHANGED = "The chat or accepted artwork changed. Request the cast scene again.";
export const LOOK_CHANGED = "A current look changed while the cast scene was preparing.";
export const QWEN_NEGATIVE = "text, watermark, different character, deformed face";
const PACK_RECIPE = { id: "visual-pack", version: 1 } as const;
type Story = NonNullable<ReturnType<RuntimeManager["getStory"]>>;
type Cast = ReturnType<typeof spriteCast>;
type Values = Record<string, PrimitiveValue>;

const rosterFor = (story: Story, cast: Cast, folder: string) => {
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

export function castMember(story: Story, roster: RosterMember, folder: string, sources: VisualSources, values: Values, visual: VisualScene | null): CastSceneMember | null {
  const source = sources[folder], pack = packLook(visual?.subjects.find((subject) => subject.member === roster.id));
  const fields = cardValues(story, values, roster.id, true);
  if (pack && (!pack.substituted || !source)) return { character: folder, fields, pack, card: roster.card };
  return source ? { character: folder, fields, source, card: roster.card } : null;
}

function selectedMembers(story: Story, cast: Cast, selected: string[], values: Values, visual: VisualScene | null): CastSceneMember[] {
  const sources = getGlobalSettings().sprites.visualSources;
  return selected.map((folder) => {
    const roster = rosterFor(story, cast, folder);
    const member = castMember(story, roster, folder, sources, values, visual);
    if (!member) throw packGap(roster.name ?? roster.id, visual?.subjects.find((row) => row.member === roster.id), story.illustrations?.packs?.identities?.[roster.id]);
    return member;
  });
}

export function currentIdentities(story: Story, members: CastSceneMember[], values: Values): string {
  const cast = spriteCast(), sources = getGlobalSettings().sprites.visualSources;
  return JSON.stringify(castSceneIdentities(members.map((member) => {
    const installed = cast.members.find((row) => row.folder === member.character);
    const roster = story.roster.find((row) => (row.name ?? row.id) === installed?.name);
    if (!roster) throw new Error("The cast changed.");
    return { ...member, fields: cardValues(story, values, roster.id, true), card: roster.card, ...(member.pack ? {} : { source: sources[member.character] }) };
  })));
}

async function packScene(manager: RuntimeManager, story: Story, cast: Cast, selected: string[], signal: AbortSignal): Promise<VisualScene | null> {
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
    if (!run.stillOwns()) throw new Error(CAST_CHANGED);
  }
}

export interface QwenJob {
  members: CastSceneMember[]; identities: CastSceneIdentity[]; prompt: string; seed: number; plate: SceneFile | null; folder: string; prefix: string;
  run: { stillOwns(): boolean }; guard(): void; packsCurrent(signal: AbortSignal): Promise<void>; saved(path: string): void;
}
export interface QwenResult { path: string; recipeSource: string; diffusion: string; width: number; height: number; waitedMs: number; plate: boolean }

const pause = (ms: number) => () => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function verifyInputs(job: QwenJob, signal: AbortSignal): Promise<void> {
  for (const member of job.members) if (member.source) await verifyVisualSource(member.source, signal);
  for (const identity of job.identities) {
    if (identity.root.startsWith("pack:")) continue;
    if (await spriteFileFingerprint(identity.look.base.path, signal) !== identity.look.base.sha256) throw new Error("The current-look file changed. Prepare it again.");
  }
  await job.packsCurrent(signal);
}

async function uploadVerified(file: SceneFile, job: QwenJob, signal: AbortSignal, refs: string[], what: string) {
  const image = await decodeImage(file.path);
  job.guard(); signal.throwIfAborted();
  if (image.sha256 !== file.sha256) throw new Error(`The ${what} changed before upload.`);
  refs.push(await comfyReference(encodeImage(image), signal));
  return image;
}

export async function renderQwenJob(job: QwenJob, signal: AbortSignal): Promise<QwenResult> {
  const started = Date.now();
  job.guard(); signal.throwIfAborted();
  await verifyInputs(job, signal);
  const discovery = await comfyDiscover(signal);
  const settings = getGlobalSettings().sprites, selected = job.members.map((member) => member.character);
  const config = (() => {
    try { return sceneRecipe(selected, settings.builders, settings.sceneRecipe, discoveredSceneRecipe(discovery)); }
    catch (error) { throw new CastSetupGap([error instanceof Error ? error.message : String(error), discoveryProblem(discovery)].filter(Boolean).join(" ")); }
  })();
  const problems = recipeProblems(discovery, config.models);
  if (problems.length) throw new CastSetupGap(problems.join(" "));
  if (job.identities.length === 2 && !qwenImageInput(discovery, "image_2")) throw new CastSetupGap(CAST_TWO_REFERENCE_MISSING);
  const plate = job.plate && qwenImageInput(discovery, `image_${job.identities.length + 1}`) ? job.plate : null;
  const [diffusion, encoder, vae] = await Promise.all([comfyFingerprint("diffusionModels", config.models.diffusion, signal),
    comfyFingerprint("textEncoders", config.models.encoder, signal), comfyFingerprint("vaes", config.models.vae, signal)]);
  const render = { steps: config.steps, resolution: config.resolution };
  const input = { prompt: job.prompt, models: { diffusion, encoder, vae }, seed: job.seed, ...render };
  const key = await contentHash(new TextEncoder().encode(castSceneKey(job.identities, input, plate?.sha256)));
  await waitForTextPriority({ status: gpuBrokerStatus, loud: hostGenerating, current: () => job.run.stillOwns(), signal, now: Date.now, sleep: pause(500) });
  job.guard(); signal.throwIfAborted();
  const lease = await leaseOutsideTurns({ acquire: () => reserveGpu({ workflowKey: key, width: render.resolution, height: render.resolution, signal, foreground: true,
    modelFiles: [{ kind: "diffusionModels", name: diffusion.name }, { kind: "textEncoders", name: encoder.name }, { kind: "vaes", name: vae.name }] }),
  release: async (held) => { await releaseGpu(held.lease); }, loud: hostGenerating, sleep: pause(500), signal });
  const waitedMs = Date.now() - started;
  const heartbeat = setInterval(() => { void renewGpu(lease.lease); }, 60_000);
  const refs: string[] = [];
  try {
    const first = await uploadVerified(job.identities[0].look.base, job, signal, refs, "identity image");
    for (const identity of job.identities.slice(1)) await uploadVerified(identity.look.base, job, signal, refs, "identity image");
    if (plate) await uploadVerified(plate, job, signal, refs, "place plate");
    const result = await comfyRenderOwned(castSceneGraph(refs.slice(0, job.identities.length), input, plate ? refs[job.identities.length] : undefined), signal);
    job.guard(); signal.throwIfAborted();
    await job.packsCurrent(signal);
    job.guard(); signal.throwIfAborted();
    const saved = await imageSave(result.data, result.format, job.folder, `${job.prefix}_${key.slice(0, 16)}`);
    job.saved(saved);
    job.guard(); signal.throwIfAborted();
    return { path: saved, recipeSource: config.source, diffusion: diffusion.name, ...qwenOutputSize(first.width, first.height, render.resolution), waitedMs, plate: Boolean(plate) };
  } finally {
    clearInterval(heartbeat);
    try { await Promise.all(refs.splice(0).map((ref) => comfyReleaseReference(ref))); }
    finally { await releaseGpu(lease.lease); }
  }
}

export const identityRecord = (identities: CastSceneIdentity[]) => identities.map((identity) => ({ character: identity.character,
  root: identity.root, signature: identity.signature, sha256: identity.look.base.sha256, ...(identity.layered ? { substituted: identity.layered } : {}) }));

export async function drawPreparedCast(manager: RuntimeManager, queue: ImageQueue, selected: string[], direction: string,
  options: { target?: number | null } = {}): Promise<string> {
  const run = beginRun(manager.getOwnership());
  let path: string | null = null;
  try {
    const chat = imageChat(), story = manager.getStory(), cast = spriteCast();
    if (!chat || !story || !manager.ownsImageChat(chat.id)) throw new Error("Open the story's group before illustrating its cast.");
    const visual = await packScene(manager, story, cast, selected, run.signal);
    const { members, identities } = await settledLooks(() => selectedMembers(story, cast, selected, manager.getCachedSnapshot().blackboard, visual), run);
    const packed = members.some((member) => member.pack);
    const packsCurrent = async (signal: AbortSignal) => {
      if (visual && packed && !(await visualBridge().stillCurrent(visual, signal))) throw new CastSetupGap(PACK_CHANGED, PLAYER_COPY.castRetry);
    };
    const target = options.target !== undefined && (options.target === null || chat.messages[options.target]) ? options.target : illustratedReply(chat.messages);
    const targetText = target === null ? null : chat.messages[target].mes;
    const guard = () => {
      const now = imageChat();
      if (!run.stillOwns() || !now || now.id !== chat.id || (target !== null && now.messages[target]?.mes !== targetText)
        || members.some((member) => member.source && !sourceStillCurrent(member.source))) throw new Error(CAST_CHANGED);
      if (currentIdentities(story, members, manager.getCachedSnapshot().blackboard) !== JSON.stringify(identities)) throw new Error(LOOK_CHANGED);
    };
    const prompt = [direction.trim() || "The selected characters together in the current scene.",
      ...members.map((member, index) => `Character ${index + 1}: ${publicLook(member.fields)}`
        + (identities[index].layered?.length ? ` (the reference image predates ${identities[index].layered?.join(", ")}; draw those details as described)` : ""))].join(" ");
    const result = await queue.enqueue("Prepared cast · Qwen 2.1", (queuedSignal) => renderQwenJob({ members, identities, prompt, seed: 1234, plate: null,
      folder: chat.folder, prefix: "cast", run, guard, packsCurrent, saved: (saved) => { path = saved; } }, anySignal([run.signal, queuedSignal])));
    path = result.path;
    guard();
    await packsCurrent(run.signal);
    guard();
    const placed = await imagePlace(chat.id, target, "Prepared cast illustration", { url: result.path, type: "image", title: "Prepared cast illustration", source: "generated",
      image_director: { purpose: "cast-scene", recipe: CAST_SCENE_RECIPE, recipe_source: result.recipeSource, identities: identityRecord(identities),
        idle_wait_ms: result.waitedMs, ...(visual ? { visual: visualRecord(visual) } : {}) } }, "inline");
    if (!placed.ok) throw new Error(placed.reason);
    return result.path;
  } catch (error) { if (path) await discardUnplaced(path); throw error; }
  finally { run.release(); }
}

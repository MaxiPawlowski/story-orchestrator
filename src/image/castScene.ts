import { stableStringify } from "@runtime/hash";
import { currentVisual, lookSignature, visualRoot, type VisualManifest, type VisualLook } from "../sprites/visualManifest";
import { editGraph, type EditModels } from "../sprites/builder/recipes";
import { builderRender, type SpriteSettings } from "../sprites/settings";
export { discoveredSceneRecipe } from "../sprites/defaultRecipe";
import { lookLayers } from "../sprites/poses/layers";
import type { CardBinding, VisualPackRef } from "@engine/schema";
import type { SceneSubject } from "../sprites/packs/scene";
import { PLAYER_COPY } from "@runtime/narrative";

export const CAST_SCENE_RECIPE = { id: "qwen21-current-look-cast-scene", version: 1 } as const;
export const CAST_TWO_REFERENCE_MISSING = "Two characters need a second image input on ComfyUI's Qwen 2.1 text encoder node (TextEncodeQwenImage21, images.image_2), "
  + "and this ComfyUI does not offer it. Update ComfyUI's Qwen nodes, or draw one character.";
export class CastSetupGap extends Error {
  override name = "CastSetupGap";
  constructor(message: string, readonly player: string = PLAYER_COPY.castSetup) { super(message); }
}
export function packGap(name: string, subject: SceneSubject | undefined, bound?: VisualPackRef): CastSetupGap {
  const pack = subject?.pack ?? bound, id = pack ? `${pack.id}@${pack.digest.slice(0, 12)}` : "";
  const newer = subject?.newer ? ` A newer revision is installed (${subject.newer.id}@${subject.newer.digest.slice(0, 12)}); update the story's binding.` : "";
  const prepare = " Reinstall the pack, or prepare the character's base and bust in Studio.";
  switch (subject?.fallback) {
    case "pack-missing": return new CastSetupGap(`${name}'s visual pack ${id} is not installed, or the catalog refused it (for example its content no longer matches its digest).`
      + newer + prepare, PLAYER_COPY.castArtMissing);
    case "asset-mismatch": return new CastSetupGap(`${name}'s visual pack ${id} was refused: its look images no longer match the hashes it records.${prepare}`, PLAYER_COPY.castArtChanged);
    case "pack-kind": return new CastSetupGap(`${name}'s binding ${id} is not an identity pack. Bind an identity pack, or prepare the character's base and bust in Studio.`);
    default: return new CastSetupGap(`${name} has no accepted base and bust and no identity pack. Prepare the presentation in Studio, or bind an identity pack.`, PLAYER_COPY.castUnprepared);
  }
}
export class LookPending extends Error { override name = "LookPending"; }
export interface CastScenePack { root: string; look: VisualLook; substituted: boolean }
export interface CastSceneMember { character: string; fields: Record<string, string>; source?: VisualManifest; card?: CardBinding; pack?: CastScenePack }
export interface CastSceneIdentity { character: string; root: string; signature: string; look: VisualLook; layered?: string[] }
function layeredLook(member: CastSceneMember & { source: VisualManifest }): { signature: string; look: VisualLook; layered: string[] } | null {
  if (!member.card) return null;
  const layers = lookLayers(member.card, member.fields), layered = [...Object.keys(layers.face), ...Object.keys(layers.decal)].sort();
  if (!layered.length || !Object.keys(member.fields).every((field) => field in layers.base || field in layers.face || field in layers.decal)) return null;
  const signature = lookSignature(layers.base), look = currentVisual(member.source, signature);
  return look ? { signature, look, layered } : null;
}
export function castSceneIdentities(members: CastSceneMember[]): CastSceneIdentity[] {
  if (!members.length || members.length > 2 || new Set(members.map((member) => member.character)).size !== members.length) {
    throw new Error("Choose one or two different prepared cast members.");
  }
  return members.map((member) => {
    if (member.pack) return { character: member.character, root: member.pack.root, signature: lookSignature(member.fields), look: member.pack.look,
      ...(member.pack.substituted && Object.keys(member.fields).length ? { layered: Object.keys(member.fields).sort() } : {}) };
    if (!member.source || member.source.character !== member.character) throw new Error("Prepare each selected character's base and bust first.");
    const source = member.source, signature = lookSignature(member.fields), look = currentVisual(source, signature);
    if (look) return { character: member.character, root: visualRoot(source), signature, look };
    const layered = layeredLook({ ...member, source });
    if (layered) return { character: member.character, root: visualRoot(source), ...layered };
    throw new LookPending("A selected character's current look is pending or stale. Prepare that look before illustrating the cast.");
  });
}
type SceneBuilder = Pick<SpriteSettings["builders"][string], "models" | "steps" | "resolution">;
export type SceneRecipeSource = "builders" | "install" | "discovered";
export interface SceneRecipe { models: SceneBuilder["models"]; steps: number; resolution: number; source: SceneRecipeSource }
export const SCENE_RECIPE_MISSING = "No Qwen edit route is set for a selected character, and no install-wide scene recipe could be chosen. "
  + "Set sprites.sceneRecipe, or configure the character's Qwen edit route under Prepare presentation.";
export function sceneRecipe(selected: string[], builders: Record<string, SceneBuilder | undefined>, install: SceneBuilder | null, discovered: SceneBuilder | null): SceneRecipe {
  const fallback = install ?? discovered;
  if (!selected.length || (!fallback && selected.some((folder) => !builders[folder]))) throw new Error(SCENE_RECIPE_MISSING);
  const source: SceneRecipeSource = selected.every((folder) => builders[folder]) ? "builders" : install ? "install" : "discovered";
  return { ...mergedBuilders(selected.map((folder) => builders[folder] ?? fallback) as SceneBuilder[]), source };
}
export function castSceneBuilder(selected: string[], builders: Record<string, SceneBuilder | undefined>): { models: SceneBuilder["models"]; steps: number; resolution: number } {
  const configs = selected.map((folder) => builders[folder]);
  if (!configs.length || configs.some((config) => !config)) throw new Error("Configure every selected character's Qwen edit route under Prepare presentation.");
  return mergedBuilders(configs as SceneBuilder[]);
}
function mergedBuilders(ready: SceneBuilder[]): { models: SceneBuilder["models"]; steps: number; resolution: number } {
  const models = ready[0].models;
  if (ready.some((config) => stableStringify(config.models) !== stableStringify(models))) {
    throw new Error("The selected characters use different Qwen models. Choose the same diffusion, encoder and VAE for each before illustrating them together.");
  }
  const renders = ready.map(builderRender);
  return { models, steps: Math.max(...renders.map((render) => render.steps)), resolution: Math.max(...renders.map((render) => render.resolution)) };
}
export const castSceneKey = (identities: CastSceneIdentity[], input: { prompt: string; models: EditModels; seed: number; steps: number; resolution: number }, plate?: string): string =>
  stableStringify({ recipe: CAST_SCENE_RECIPE, identities: identities.map((identity) => ({ character: identity.character, root: identity.root,
    signature: identity.signature, sha256: identity.look.base.sha256, ...(identity.layered ? { layered: identity.layered } : {}) })), ...input, ...(plate ? { plate } : {}) });

const castLead = (count: number, plate: boolean): string => plate
  ? `The first ${count === 1 ? "reference image shows one character" : `${count} reference images show ${count} distinct characters`}; the last reference image shows only the place. `
  : `The reference images show ${count} distinct character${count === 1 ? "" : "s"}. `;

export function castSceneGraph(references: string[], input: { prompt: string; models: EditModels; seed: number; steps: number; resolution: number }, plate?: string): Record<string, unknown> {
  if (references.length < 1 || references.length > 2) throw new Error("The cast scene recipe supports at most two identities.");
  const instruction = castLead(references.length, Boolean(plate))
    + "Preserve each character's face, hair, current outfit and art style. Draw one coherent scene, never panels or a collage. " + input.prompt;
  const graph = editGraph({ ...input, reference: references[0], instruction });
  const encoder = graph["6"] as { inputs: Record<string, unknown> };
  if (references[1]) {
    graph["12"] = { class_type: "LoadImage", inputs: { image: references[1] } };
    encoder.inputs["images.image_2"] = ["12", 0];
  }
  if (plate) {
    graph["13"] = { class_type: "LoadImage", inputs: { image: plate } };
    encoder.inputs[`images.image_${references.length + 1}`] = ["13", 0];
  }
  graph["9"] = { class_type: "SaveImage", inputs: { filename_prefix: "so-cast-scene", images: ["8", 0] } };
  return graph;
}

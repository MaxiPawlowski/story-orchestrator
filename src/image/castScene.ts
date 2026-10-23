import { stableStringify } from "@runtime/hash";
import { currentVisual, lookSignature, visualRoot, type VisualManifest, type VisualLook } from "../sprites/visualManifest";
import { editGraph, type EditModels } from "../sprites/builder/recipes";
import { builderRender, type SpriteSettings } from "../sprites/settings";
import { lookLayers } from "../sprites/poses/layers";
import type { CardBinding } from "@engine/schema";

export const CAST_SCENE_RECIPE = { id: "qwen21-current-look-cast-scene", version: 1 } as const;
export const CAST_TWO_REFERENCE_MISSING = "Two characters need a second image input on ComfyUI's Qwen 2.1 text encoder node (TextEncodeQwenImage21, images.image_2), "
  + "and this ComfyUI does not offer it. Update ComfyUI's Qwen nodes, or draw one character.";
export class CastSetupGap extends Error { override name = "CastSetupGap"; }
export class LookPending extends Error { override name = "LookPending"; }
export interface CastSceneMember { character: string; fields: Record<string, string>; source?: VisualManifest; card?: CardBinding }
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
    if (!member.source || member.source.character !== member.character) throw new Error("Prepare each selected character's base and bust first.");
    const source = member.source, signature = lookSignature(member.fields), look = currentVisual(source, signature);
    if (look) return { character: member.character, root: visualRoot(source), signature, look };
    const layered = layeredLook({ ...member, source });
    if (layered) return { character: member.character, root: visualRoot(source), ...layered };
    throw new LookPending("A selected character's current look is pending or stale. Prepare that look before illustrating the cast.");
  });
}
type SceneBuilder = Pick<SpriteSettings["builders"][string], "models" | "steps" | "resolution">;
export function castSceneBuilder(selected: string[], builders: Record<string, SceneBuilder | undefined>): { models: SceneBuilder["models"]; steps: number; resolution: number } {
  const configs = selected.map((folder) => builders[folder]);
  if (!configs.length || configs.some((config) => !config)) throw new Error("Configure every selected character's Qwen edit route under Prepare presentation.");
  const ready = configs as SceneBuilder[], models = ready[0].models;
  if (ready.some((config) => stableStringify(config.models) !== stableStringify(models))) {
    throw new Error("The selected characters use different Qwen models. Choose the same diffusion, encoder and VAE for each before illustrating them together.");
  }
  const renders = ready.map(builderRender);
  return { models, steps: Math.max(...renders.map((render) => render.steps)), resolution: Math.max(...renders.map((render) => render.resolution)) };
}
export const castSceneKey = (identities: CastSceneIdentity[], input: { prompt: string; models: EditModels; seed: number; steps: number; resolution: number }): string =>
  stableStringify({ recipe: CAST_SCENE_RECIPE, identities: identities.map((identity) => ({ character: identity.character, root: identity.root,
    signature: identity.signature, sha256: identity.look.base.sha256, ...(identity.layered ? { layered: identity.layered } : {}) })), ...input });

export function castSceneGraph(references: string[], input: { prompt: string; models: EditModels; seed: number; steps: number; resolution: number }): Record<string, unknown> {
  if (references.length < 1 || references.length > 2) throw new Error("The cast scene recipe supports at most two identities.");
  const instruction = `The reference images show ${references.length} distinct character${references.length === 1 ? "" : "s"}. `
    + "Preserve each one's face, hair, current outfit and art style. Draw one coherent scene, never panels or a collage. " + input.prompt;
  const graph = editGraph({ ...input, reference: references[0], instruction });
  if (references[1]) {
    graph["12"] = { class_type: "LoadImage", inputs: { image: references[1] } };
    const encoder = graph["6"] as { inputs: Record<string, unknown> };
    encoder.inputs["images.image_2"] = ["12", 0];
  }
  graph["9"] = { class_type: "SaveImage", inputs: { filename_prefix: "so-cast-scene", images: ["8", 0] } };
  return graph;
}

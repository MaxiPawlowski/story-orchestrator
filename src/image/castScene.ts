import { stableStringify } from "@runtime/hash";
import { currentVisual, lookSignature, visualRoot, type VisualManifest, type VisualLook } from "../sprites/visualManifest";
import { editGraph, type EditModels } from "../sprites/builder/recipes";

export const CAST_SCENE_RECIPE = { id: "qwen21-current-look-cast-scene", version: 1 } as const;
export interface CastSceneMember { character: string; fields: Record<string, string>; source?: VisualManifest }
export interface CastSceneIdentity { character: string; root: string; signature: string; look: VisualLook }
export function castSceneIdentities(members: CastSceneMember[]): CastSceneIdentity[] {
  if (!members.length || members.length > 2 || new Set(members.map((member) => member.character)).size !== members.length) {
    throw new Error("Choose one or two different prepared cast members.");
  }
  return members.map((member) => {
    const signature = lookSignature(member.fields);
    if (!member.source || member.source.character !== member.character) throw new Error("Prepare each selected character's base and bust first.");
    const look = currentVisual(member.source, signature);
    if (!look) throw new Error("A selected character's current look is pending or stale. Prepare that look before illustrating the cast.");
    return { character: member.character, root: visualRoot(member.source), signature, look };
  });
}
export const castSceneKey = (identities: CastSceneIdentity[], input: { prompt: string; models: EditModels; seed: number; steps: number; resolution: number }): string =>
  stableStringify({ recipe: CAST_SCENE_RECIPE, identities: identities.map((identity) => ({ character: identity.character, root: identity.root,
    signature: identity.signature, sha256: identity.look.base.sha256 })), ...input });

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

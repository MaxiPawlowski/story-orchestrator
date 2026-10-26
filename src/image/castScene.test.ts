import type { CardBinding } from "@engine/schema";
import { castSceneBuilder, castSceneIdentities, castSceneKey, castSceneGraph, discoveredSceneRecipe, sceneRecipe, SCENE_RECIPE_MISSING } from "./castScene";
import { visualFixture } from "../sprites/visualFixtures";
import { publishVisualLook, lookSignature, visualRoot } from "../sprites/visualManifest";
const source = visualFixture();
const input = { prompt: "Two synthetic adventurers beside a plain fountain", seed: 1234, steps: 25, resolution: 1024,
  models: { diffusion: { name: "qwen", sha256: "a".repeat(64), size: 1 }, encoder: { name: "encoder", sha256: "b".repeat(64), size: 1 }, vae: { name: "vae", sha256: "c".repeat(64), size: 1 } } };

test("scene refuses the original outfit when the current look is unprepared, then uses the current derivative", () => {
  const fields = { outfit: "blue coat" };
  expect(() => castSceneIdentities([{ character: "Synthetic", fields, source }])).toThrow("pending or stale");
  const changed = publishVisualLook(source, visualRoot(source), "look_blue", lookSignature(fields), { ...source.base, sha256: "e".repeat(64) });
  const identities = castSceneIdentities([{ character: "Synthetic", fields, source: changed }]);
  expect(identities[0].look.base.sha256).toBe("e".repeat(64));
  const original = castSceneIdentities([{ character: "Synthetic", fields: {}, source }]);
  expect(castSceneKey(identities, input)).not.toBe(castSceneKey(original, input));
});

test("missing, duplicate or unsupported cast sizes refuse without a fabricated default identity", () => {
  const member = { character: "Synthetic", fields: {}, source };
  for (const members of [[], [member, member], [member, member, member], [{ character: "Synthetic", fields: {} }]]) expect(() => castSceneIdentities(members)).toThrow();
});

test("two-member scene uses exactly two identities and never a pose skeleton or four-reference head edit", () => {
  const graph = castSceneGraph(["first.png", "second.png"], input) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  expect(graph["6"].inputs["images.image_2"]).toEqual(["12", 0]);
  expect(graph["12"].inputs.image).toBe("second.png"); expect(graph["6"].inputs["images.image_3"]).toBeUndefined();
  expect(graph["7"].inputs.steps).toBe(25); expect(graph["6"].inputs.prompt).toContain("current outfit");
});

test("scene route reads every selected member's builder and refuses a missing or mismatched one", () => {
  const models = { diffusion: "qwen", encoder: "encoder", vae: "vae" };
  const builders = { A: { models, steps: 20 }, B: { models, steps: 30, resolution: 1280 }, C: { models: { ...models, vae: "other" }, steps: 20 } };
  expect(castSceneBuilder(["A", "B"], builders)).toEqual({ models, steps: 30, resolution: 1280 });
  expect(castSceneBuilder(["B", "A"], builders)).toEqual(castSceneBuilder(["A", "B"], builders));
  expect(() => castSceneBuilder(["A", "Missing"], builders)).toThrow("every selected character");
  expect(() => castSceneBuilder(["Missing", "A"], builders)).toThrow("every selected character");
  expect(() => castSceneBuilder(["A", "C"], builders)).toThrow("different Qwen models");
});

test("a face or decal-only change reuses the current outfit derivative and records the layered fields in the cache identity", () => {
  const card: CardBinding = { fields: { outfit: { quality: "q_outfit", visual: true }, scar: { quality: "q_scar", visual: true, layer: "decal", region: { x: 1, y: 1, width: 4, height: 4 } },
    eyes: { quality: "q_eyes", visual: true, layer: "face" } } };
  const changed = publishVisualLook(source, visualRoot(source), "look_blue", lookSignature({ outfit: "blue coat" }), { ...source.base, sha256: "e".repeat(64) });
  const fields = { outfit: "blue coat", scar: "thin scar on the cheek", eyes: "tired" };
  expect(() => castSceneIdentities([{ character: "Synthetic", fields, source: changed }])).toThrow("pending or stale");
  const [identity] = castSceneIdentities([{ character: "Synthetic", fields, source: changed, card }]);
  expect(identity.look.base.sha256).toBe("e".repeat(64)); expect(identity.layered).toEqual(["eyes", "scar"]);
  const plain = castSceneIdentities([{ character: "Synthetic", fields: { outfit: "blue coat" }, source: changed, card }]);
  expect(castSceneKey([identity], input)).not.toBe(castSceneKey(plain, input));
  const faceOnly = castSceneIdentities([{ character: "Synthetic", fields: { eyes: "tired" }, source, card }]);
  expect(faceOnly[0].look.base.sha256).toBe(source.base.sha256);
  expect(() => castSceneIdentities([{ character: "Synthetic", fields: { outfit: "red coat", eyes: "tired" }, source: changed, card }])).toThrow("pending or stale");
  expect(() => castSceneIdentities([{ character: "Synthetic", fields: { unbound: "x", eyes: "tired" }, source, card }])).toThrow("pending or stale");
});

test("visual bridge: a character without a builder entry uses the install-wide recipe, else an unambiguous discovered Qwen 2.1 edit route, else a named refusal", () => {
  const models = { diffusion: "qwen", encoder: "enc", vae: "vae" }, builders = { A: { models, steps: 30, resolution: 1280 } };
  const install = { models, steps: 12 };
  expect(sceneRecipe(["A"], builders, null, null)).toEqual({ models, steps: 30, resolution: 1280, source: "builders" });
  expect(sceneRecipe(["A", "B"], builders, install, null)).toEqual({ models, steps: 30, resolution: 1280, source: "install" });
  expect(sceneRecipe(["B"], {}, install, null)).toEqual({ models, steps: 12, resolution: 1024, source: "install" });
  expect(() => sceneRecipe(["B"], {}, null, null)).toThrow(SCENE_RECIPE_MISSING);
  const found = discoveredSceneRecipe({ diffusionModels: ["qwen_image_2.1_int8_convrot.safetensors", "qwen_image_2.1_turbo_int8.safetensors", "sdxl_unet.safetensors"],
    textEncoders: ["qwen3vl_8b_int8.safetensors", "clip_l.safetensors"], vaes: ["qwen_image_2.1_vae.safetensors", "sdxl_vae.safetensors"] });
  expect(found).toEqual({ models: { diffusion: "qwen_image_2.1_int8_convrot.safetensors", encoder: "qwen3vl_8b_int8.safetensors", vae: "qwen_image_2.1_vae.safetensors" }, steps: 25, resolution: 1024 });
  expect(sceneRecipe(["B"], {}, null, found).source).toBe("discovered");
  expect(discoveredSceneRecipe({ diffusionModels: ["qwen_image_2.1_a.safetensors", "qwen_image_2.1_b.safetensors"], textEncoders: ["qwen.safetensors"], vaes: ["qwen_vae.safetensors"] })).toBeNull();
});

test("visual bridge: a pack identity needs no accepted source, and a substituted pack look names the fields its reference predates", () => {
  const base = { path: "/characters/Wanderer/pack/default_neutral.png", sha256: "a".repeat(64), key: "pack:p@d", recipe: { id: "visual-pack", version: 1 } };
  const pack = { root: "pack:p@d", look: { root: "pack:p@d", signature: "[]", base }, substituted: true };
  expect(castSceneIdentities([{ character: "Wanderer", fields: { outfit: "apron" }, pack }])).toEqual([
    { character: "Wanderer", root: "pack:p@d", signature: lookSignature({ outfit: "apron" }), look: pack.look, layered: ["outfit"] }]);
  expect(castSceneIdentities([{ character: "Wanderer", fields: {}, pack: { ...pack, substituted: false } }])[0].layered).toBeUndefined();
});

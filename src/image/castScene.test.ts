import { castSceneIdentities, castSceneKey, castSceneGraph } from "./castScene";
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

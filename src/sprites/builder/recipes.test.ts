import { editInstruction, editGraph } from "./recipes";

test("conversational frames preserve the reference expression and request a visibly open mouth", () => {
  const neutral = editInstruction("talk", "neutral"), happy = editInstruction("talk", "happy");
  expect(neutral).toContain("mouth visibly open");
  expect(neutral).toContain("reference's existing gentle expression");
  expect(neutral).not.toContain("relaxed neutral expression");
  expect(happy).toContain("reference's happy smile and its corners");
  expect(happy).toContain("no second mouth or leftover line");
  for (const label of ["angry", "worried"]) expect(editInstruction("talk", label)).toBe(
    "Same image, same character, same pose, head angle, framing, lighting and colours. "
      + "Change only mouth open as if speaking; preserve the eyes and emotion. Everything else stays identical. Plain white background.");
});

test("smaller resolution goes into the actual edit latent producer without changing samplers or steps", () => {
  const model = { name: "model", sha256: "a".repeat(64), size: 1 };
  const parameters = { models: { diffusion: model, encoder: model, vae: model }, seed: 1, steps: 25, reference: "ref", instruction: "edit" };
  const original = editGraph(parameters), smaller = editGraph({ ...parameters, resolution: 512 });
  expect(smaller["6"]).toEqual({ ...(original["6"] as object), inputs: { ...(original["6"] as { inputs: object }).inputs, resolution: 512 } });
  expect(smaller["7"]).toEqual(original["7"]);
});

test("resting correction explicitly closes the lips without generating a speaking frame", () => {
  const prompt = editInstruction("rest", "neutral");
  expect(prompt).toContain("closed-mouth resting pose");
  expect(prompt).toContain("no visible teeth, tongue or gap");
  expect(prompt).toContain("Preserve the original eyes");
  expect(prompt).not.toContain("as if speaking");
});

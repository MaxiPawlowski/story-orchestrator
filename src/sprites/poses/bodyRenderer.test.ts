import { webcrypto } from "node:crypto";
import type { RunOwnership } from "@runtime/runToken";
import { PoseBodies, type BodyDeps, type BodyRequest } from "./bodyRenderer";
import { shippedPoses } from "./library";
import { lookLayers, renderAllowed } from "./layers";
import type { SpriteBuildRequest, SpriteCandidate } from "../builder/builder";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const fingerprint = { name: "m", sha256: "a".repeat(64), size: 1 };
const ownership: RunOwnership = { mint: () => ({ chatId: "c", storyId: "s", storyHash: "h", sessionEpoch: 1, windowRevision: 0, window: null }), check: () => ({ ok: true }) };
const pose = shippedPoses().find((pose) => pose.id === "sit_chair")!;
function setup() {
  const calls: SpriteBuildRequest[] = [], cache = new Map<string, Map<string, { path: string; sha256: string }>>();
  const pixel = { width: 128, height: 192, data: new Uint8ClampedArray(128 * 192 * 4), sha256: "a".repeat(64) };
  for (let y = 8; y < 184; y++) for (let x = 24; x < 104; x++) pixel.data[(y * 128 + x) * 4 + 3] = 255;
  const file = { label: "neutral", path: "base", sha256: fingerprint.sha256, width: 128, height: 192 };
  const builder = { build: jest.fn(async (request: SpriteBuildRequest) => { calls.push(request); return { request } as SpriteCandidate; }),
    save: jest.fn(async (candidate: SpriteCandidate) => { const request = candidate.request, saved = { path: `${request.set}/${request.label}`, sha256: fingerprint.sha256 };
      const pack = cache.get(request.set) ?? new Map(); pack.set(request.label, saved); cache.set(request.set, pack); return saved; }), cancel: jest.fn(), close: jest.fn() };
  const deps: BodyDeps = { ownership, builder: () => builder, discover: async () => ({ nodes: {}, embeddings: [], checkpoints: [], diffusionModels: [], textEncoders: [], vaes: [], loras: [], upscalers: [],
    alpha: [{ id: "alpha", node: "RMBG", model: "b", files: [fingerprint] }] }), models: async () => ({ diffusion: fingerprint, encoder: fingerprint, vae: fingerprint }),
    pack: async (character, set) => ({ character, set, sha256: fingerprint.sha256, files: set === "base" ? [file] : [...(cache.get(set) ?? [])].map(([label, item]) => ({ ...file, ...item, label })) }),
    manifest: async (character, set) => ({ owner: "story-orchestrator", version: 1, character, set, labels: Object.fromEntries([...(cache.get(set) ?? [])].map(([label, file]) => [label, { key: "k", sha256: file.sha256, recipe: { id: "r", version: 1 }, qa: {}, status: "complete" }])) }),
    decode: async () => pixel, wait: async () => {} };
  const request: BodyRequest = { story: "s", member: "a", folder: "a", label: "neutral", pose, layers: lookLayers(undefined, {}), frames: false,
    config: { baseSet: "base", box: { x: 40, y: 10, width: 30, height: 35 }, models: { diffusion: "m", encoder: "m", vae: "m" }, steps: 25 },
    accepts: () => true, apply: jest.fn(), failed: jest.fn() };
  return { deps, request, calls, builder, cache };
}

test("P2 is attempted first, P3 falls back on unsupported skeleton input, and cached bodies are reused", async () => {
  const { deps, request, calls, builder } = setup();
  const build = builder.build.getMockImplementation()!;
  builder.build.mockImplementation(async (request) => { if (request.poseRoute === "p2") { calls.push(request); throw new Error("unsupported images.image_2"); } return build(request); });
  const renderer = new PoseBodies(deps);
  expect(await renderer.render(request)).not.toBeNull();
  expect(calls.map((call) => call.poseRoute)).toEqual(["p2", "p3"]);
  await renderer.render({ ...request, layers: { ...request.layers, face: { mood: "frown" } } });
  expect(calls.filter((call) => call.poseRoute === "p3")).toHaveLength(1);
  expect(calls.at(-1)?.kind).toBe("expression");
  renderer.close();
});

test("face and decal changes reuse the body; a rebase uses card art", async () => {
  const { deps, request, calls } = setup(), renderer = new PoseBodies(deps);
  await renderer.render(request);
  await renderer.render({ ...request, layers: { ...request.layers, face: { mood: "frown" } } });
  await renderer.render({ ...request, layers: { ...request.layers, decal: { scar: "bandage" }, regions: { scar: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 } } } });
  expect(calls.map((call) => call.kind)).toEqual(["pose", "expression", "decal"]);
  expect(calls.at(-1)?.box).toEqual({ x: 26, y: 38, width: 13, height: 19 });
  await renderer.render({ ...request, cardArt: "card-art", layers: { ...request.layers, base: { age: "old" }, rebase: true } });
  expect(calls.find((call) => call.kind === "base")?.reference).toBe("card-art");
  renderer.close();
});

test("stage changes during an await stop all writes and stale queued provenance never renders", async () => {
  const { deps, request, builder } = setup();
  let current = true;
  deps.wait = async () => { current = false; };
  const renderer = new PoseBodies(deps);
  await renderer.render({ ...request, accepts: () => current });
  expect(builder.build).not.toHaveBeenCalled();
  expect(request.apply).not.toHaveBeenCalled();
  renderer.request({ ...request, layers: { ...request.layers, base: { outfit: "future crown" } }, accepts: () => renderAllowed({ pose: pose.id, fields: { outfit: "future crown" } }, [{ outfit: "coat" }], [pose.id]) });
  await Promise.resolve();
  expect(builder.build).not.toHaveBeenCalled();
  renderer.close();
});

test("ownership lost after a preview prevents its save and application", async () => {
  const { deps, request, builder } = setup();
  let owns = true;
  deps.ownership = { ...ownership, check: () => owns ? { ok: true } : { ok: false, reason: "epoch", detail: "changed" } };
  const build = builder.build.getMockImplementation()!;
  builder.build.mockImplementation(async (request) => { const candidate = await build(request); owns = false; return candidate; });
  await new PoseBodies(deps).render(request);
  expect(builder.save).not.toHaveBeenCalled();
  expect(request.apply).not.toHaveBeenCalled();
});

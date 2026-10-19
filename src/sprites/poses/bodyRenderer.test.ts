import { PLACEHOLDER_ART, ST_DEFAULT_AVATAR } from "../cardArt";
import { webcrypto } from "node:crypto";
import type { RunOwnership } from "@runtime/runToken";
import { PoseBodies, poseHead, type BodyDeps, type BodyRequest } from "./bodyRenderer";
import { shippedPoses } from "./library";
import { lookLayers, renderAllowed, poseCacheKey, poseSet } from "./layers";
import { RETARGET_VERSION, LYING_RETARGET_VERSION } from "./retarget";
import { builderRender } from "../settings";
import { POSE_RECIPE } from "../builder/recipes";
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
    decode: async (path: string) => { if (path === ST_DEFAULT_AVATAR) throw new Error("no placeholder"); return pixel; }, wait: async () => {} };
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

test("a rebase from SillyTavern's default card picture is refused before any render", async () => {
  const { deps, request, calls } = setup();
  deps.decode = async () => ({ width: 8, height: 8, data: new Uint8ClampedArray(256).fill(200) });
  const renderer = new PoseBodies(deps);
  await renderer.render({ ...request, cardArt: "card-art", layers: { ...request.layers, base: { age: "old" }, rebase: true } });
  expect(request.failed).toHaveBeenCalledWith(PLACEHOLDER_ART);
  expect(calls.some((call) => call.kind === "base")).toBe(false);
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

test("a refused expression leaves the completed pose body visible", async () => {
  const { deps, request, builder } = setup();
  const build = builder.build.getMockImplementation()!;
  builder.build.mockImplementation(async (input) => {
    if (input.kind === "expression") throw new Error("The edit is shifted by 0, -5 px");
    return build(input);
  });
  expect(await new PoseBodies(deps).render({ ...request, label: "happy" })).toBeNull();
  expect(request.apply).toHaveBeenCalledTimes(1);
  expect(request.apply).toHaveBeenCalledWith(expect.objectContaining({ set: expect.stringMatching(/^lp_/), files: [expect.objectContaining({ label: "neutral" })] }));
  expect(request.failed).toHaveBeenCalledWith("The edit is shifted by 0, -5 px");
});

test("closing during discovery aborts setup before any model or render work", async () => {
  const { deps, request, builder } = setup();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  deps.discover = (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    started();
  });
  deps.models = jest.fn(deps.models);
  const renderer = new PoseBodies(deps), pending = renderer.render(request);
  await ready;
  renderer.close();
  expect(await pending).toBeNull();
  expect(deps.models).not.toHaveBeenCalled();
  expect(builder.build).not.toHaveBeenCalled();
  expect(builder.close).toHaveBeenCalled();
  expect(request.failed).not.toHaveBeenCalled();
});

test("a revalidated request stays cancelled even if its stage becomes acceptable again", async () => {
  const { deps, request, builder } = setup();
  let current = true, started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  deps.wait = (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    started();
  });
  const renderer = new PoseBodies(deps), pending = renderer.render({ ...request, accepts: () => current });
  await ready;
  current = false;
  renderer.revalidate();
  current = true;
  expect(await pending).toBeNull();
  expect(builder.build).not.toHaveBeenCalled();
  expect(request.apply).not.toHaveBeenCalled();
  expect(request.failed).not.toHaveBeenCalled();
  renderer.close();
});

test("queued cast bodies are published before animation frames consume render slots", async () => {
  const { deps, request, calls } = setup();
  let finish!: () => void;
  const complete = new Promise<void>((resolve) => { finish = resolve; });
  const published: string[] = [];
  const renderer = new PoseBodies(deps);
  for (const member of ["a", "b", "c"]) renderer.request({ ...request, member, folder: member, frames: true,
    apply: (result) => { if (!result.frames) published.push(member); else if (member === "c") finish(); },
  });
  await complete;
  expect(calls.slice(0, 3).map((call) => [call.member, call.kind])).toEqual([["a", "pose"], ["b", "pose"], ["c", "pose"]]);
  expect(new Set(published.slice(0, 3))).toEqual(new Set(["a", "b", "c"]));
  expect(calls.filter((call) => call.kind === "blink" || call.kind === "talk")).toHaveLength(6);
  renderer.close();
});

const headKeypoints = (): ReturnType<NonNullable<BodyDeps["head"]>> extends Promise<infer T> ? NonNullable<T> : never => ({ format: "openpose-body18", canvas: [128, 192],
  points: Array.from({ length: 18 }, (_, at) => at === 0 ? [60, 50] : at === 14 ? [56, 46] : at === 15 ? [64, 46] : null) });

test("an expression edits the head DWPose finds on the rendered body, not the requested skeleton's head", async () => {
  const { deps, request, calls } = setup();
  const found = headKeypoints();
  deps.head = jest.fn(async () => found);
  const result = await new PoseBodies(deps).render({ ...request, label: "happy" });
  const expression = calls.find((call) => call.kind === "expression");
  expect(expression?.box).toEqual(poseHead(found, request.config.box));
  expect(result?.body.headSource).toBe("measured");
  expect(result?.body.head).toEqual(poseHead(found, request.config.box));
});

test("a body with no person found keeps the neutral render and edits nothing at an unverified head", async () => {
  const { deps, request, calls } = setup();
  deps.head = async () => null;
  const result = await new PoseBodies(deps).render({ ...request, label: "happy", frames: true, layers: { ...request.layers, decal: { scar: "bandage" }, regions: {} } });
  expect(calls.map((call) => call.kind)).toEqual(["pose"]);
  expect(result?.body.headSource).toBe("none");
  expect(result?.files).toHaveLength(1);
});

test("an unavailable estimator falls back to the requested skeleton's head box", async () => {
  const { deps, request, calls } = setup();
  deps.head = async () => undefined;
  const result = await new PoseBodies(deps).render({ ...request, label: "happy" });
  expect(calls.map((call) => call.kind)).toEqual(["pose", "expression"]);
  expect(result?.body.headSource).toBe("target");
});

test("the member's measured skeleton changes the skeleton sent to the model and the body it caches under", async () => {
  const plain = setup(), measured = setup();
  const member = { format: "openpose-body18" as const, canvas: [128, 192] as [number, number], points: Array.from({ length: 18 }, (_, at) => [64 + (at % 3) * 6, 20 + at * 8] as [number, number]) };
  measured.deps.proportions = async () => member;
  await new PoseBodies(plain.deps).render(plain.request);
  await new PoseBodies(measured.deps).render(measured.request);
  const first = plain.calls.find((call) => call.kind === "pose"), second = measured.calls.find((call) => call.kind === "pose");
  expect(second?.pose).not.toEqual(first?.pose);
  expect(second?.set).not.toBe(first?.set);
});

test("the rendered body set is keyed by the pose-sensitive retarget version: non-lying poses keep version 2, lying poses use 3", async () => {
  const sets: Record<string, string> = {};
  for (const [id, version, other] of [["sit_chair", RETARGET_VERSION, LYING_RETARGET_VERSION], ["lie_back", LYING_RETARGET_VERSION, RETARGET_VERSION]] as const) {
    const { deps, request, calls } = setup(), chosen = shippedPoses().find((entry) => entry.id === id)!;
    await new PoseBodies(deps).render({ ...request, pose: chosen });
    const built = calls.find((call) => call.kind === "pose")!, render = builderRender(request.config);
    const keyed = (retargetVersion: number) => poseCacheKey({ story: "s", member: "a", fields: {}, pose: chosen, retarget: { canvas: [128, 192], box: { x: 24, y: 8, width: 80, height: 176 },
      headToHip: undefined, member: undefined, version: retargetVersion }, recipe: POSE_RECIPE, models: { diffusion: fingerprint, encoder: fingerprint, vae: fingerprint },
      base: fingerprint.sha256, steps: render.steps, resolution: render.resolution, cutout: { id: "alpha", node: "RMBG", model: "b", files: [fingerprint] }, secondReference: true });
    expect(built.set).toBe(poseSet(await keyed(version)));
    expect(built.set).not.toBe(poseSet(await keyed(other)));
    sets[id] = built.set;
  }
  expect(sets.sit_chair).not.toBe(sets.lie_back);
});

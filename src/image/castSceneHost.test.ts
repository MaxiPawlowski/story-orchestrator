import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { drawPreparedCast, PACK_CHANGED, settledLooks } from "./castSceneHost";
import { CAST_TWO_REFERENCE_MISSING, LookPending, SCENE_RECIPE_MISSING } from "./castScene";
import { PLAYER_COPY } from "@runtime/narrative";
import { parseStoryOrThrow } from "@engine/index";
import { createVisualBridge } from "../sprites/packs/bridge";
import { visualBridge } from "../sprites/packs/bridgeHost";
import { lookSignature, publishVisualLook, visualRoot } from "../sprites/visualManifest";
import { ImageQueue } from "./queue";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { visualFixture } from "../sprites/visualFixtures";
import { EDIT_NODES } from "../sprites/builder/recipes";
import { comfyDiscover, comfyFingerprint, comfyReference, comfyReleaseReference, comfyRenderOwned, spriteFileFingerprint } from "@services/stHost/media";
import { imageChat, imageSave, imagePlace, imageDelete } from "@services/stHost/image";
import { spriteCast } from "@services/stHost/sprites";
import { reserveGpu, releaseGpu } from "@services/stHost/gpuBroker";
import { getGlobalSettings } from "@runtime/settingsStore";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import { decodeImage } from "../sprites/builder/images";
import { sourceStillCurrent } from "../sprites/visualHost";

jest.mock("@services/stHost/media", () => ({ comfyDiscover: jest.fn(), comfyFingerprint: jest.fn(), comfyReference: jest.fn(),
  comfyReleaseReference: jest.fn(), comfyRenderOwned: jest.fn(), spriteFileFingerprint: jest.fn() }));
jest.mock("@services/stHost/image", () => ({ imageChat: jest.fn(), imageSave: jest.fn(), imagePlace: jest.fn(), imageDelete: jest.fn() }));
jest.mock("@services/stHost/sprites", () => ({ spriteCast: jest.fn() }));
jest.mock("@services/stHost/gpuBroker", () => ({ reserveGpu: jest.fn(), releaseGpu: jest.fn(), renewGpu: jest.fn(), gpuBrokerStatus: jest.fn() }));
jest.mock("@runtime/settingsStore", () => ({ getGlobalSettings: jest.fn() }));
jest.mock("../sprites/builder/images", () => ({ decodeImage: jest.fn(), encodeImage: () => "encoded-reference-bytes" }));
jest.mock("../sprites/visualHost", () => ({ verifyVisualSource: jest.fn(), sourceStillCurrent: jest.fn() }));
jest.mock("../sprites/builder/textPriority", () => ({ waitForTextPriority: jest.fn(), hostGenerating: jest.fn() }));
jest.mock("../sprites/packs/bridgeHost", () => ({ visualBridge: jest.fn() }));
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const setup = () => {
  const source = visualFixture(); let owns = true;
  const defaults = defaultGlobalSettings();
  jest.mocked(getGlobalSettings).mockReturnValue({ ...defaults, sprites: { ...defaults.sprites, visualSources: { Synthetic: source }, builders: { Synthetic: {
    baseSet: "base", box: source.box, models: { diffusion: "qwen", encoder: "encoder", vae: "vae" }, steps: 25 } } } });
  jest.mocked(imageChat).mockReturnValue({ id: "chat", folder: "Synthetic", groupId: "group", userName: "Player", characters: [], messages: [{ name: "Player", mes: "A synthetic scene", is_user: true, is_system: false }] });
  jest.mocked(spriteCast).mockReturnValue({ chatId: "chat", groupId: "group", members: [{ name: "Synthetic", folder: "Synthetic", avatar: "Synthetic.png", profile: {}, muted: false }] });
  jest.mocked(comfyDiscover).mockResolvedValue({ nodes: Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), checkpoints: [], embeddings: [], loras: [], upscalers: [],
    diffusionModels: ["qwen"], textEncoders: ["encoder"], vaes: ["vae"] });
  jest.mocked(comfyFingerprint).mockImplementation(async (_kind, name) => ({ name, sha256: "f".repeat(64), size: 1 }));
  jest.mocked(spriteFileFingerprint).mockResolvedValue(source.base.sha256);
  jest.mocked(sourceStillCurrent).mockReturnValue(true);
  jest.mocked(decodeImage).mockResolvedValue({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4), sha256: source.base.sha256 });
  jest.mocked(comfyReference).mockResolvedValue("owned-ref.png");
  jest.mocked(comfyRenderOwned).mockResolvedValue({ data: "png", format: "png" });
  jest.mocked(reserveGpu).mockResolvedValue({ lease: "owned-lease", brokered: true });
  jest.mocked(releaseGpu).mockResolvedValue({ ok: true, released: true });
  jest.mocked(comfyReleaseReference).mockResolvedValue({ ok: true, released: true });
  jest.mocked(imageSave).mockResolvedValue("/images/synthetic.png");
  jest.mocked(imagePlace).mockResolvedValue({ ok: true, placed: true });
  jest.mocked(imageDelete).mockResolvedValue({ ok: true, path: "/images/late.png" });
  const manager = { getOwnership: () => ({ mint: () => ({ chatId: "chat", storyId: "story", storyHash: "hash", sessionEpoch: 1, windowRevision: 0, window: null }),
    check: () => owns ? { ok: true } : { ok: false, reason: "chat", detail: "changed" } }),
  getStory: () => ({ roster: [{ id: "synthetic", name: "Synthetic" }], cardFieldByQuality: {} }),
  getCachedSnapshot: () => ({ blackboard: {} }), ownsImageChat: () => true } as unknown as RuntimeManager;
  return { manager, queue: new ImageQueue(), lapse: () => { owns = false; } };
};
beforeEach(() => jest.clearAllMocks());

test("two characters on a ComfyUI without the second Qwen image input are refused with the setup gap named, before any GPU lease", async () => {
  const f = setup(), source = visualFixture(), defaults = defaultGlobalSettings(), builder = { baseSet: "base", box: source.box, models: { diffusion: "qwen", encoder: "encoder", vae: "vae" }, steps: 25 };
  jest.mocked(getGlobalSettings).mockReturnValue({ ...defaults, sprites: { ...defaults.sprites, visualSources: { Synthetic: source, Second: { ...visualFixture(), character: "Second" } }, builders: { Synthetic: builder, Second: builder } } });
  jest.mocked(spriteCast).mockReturnValue({ chatId: "chat", groupId: "group", members: ["Synthetic", "Second"].map((name) => ({ name, folder: name, avatar: `${name}.png`, profile: {}, muted: false })) });
  const manager = { ...f.manager, getStory: () => ({ roster: [{ id: "synthetic", name: "Synthetic" }, { id: "second", name: "Second" }], cardFieldByQuality: {} }) } as unknown as RuntimeManager;
  const refusal = drawPreparedCast(manager, f.queue, ["Synthetic", "Second"], "");
  await expect(refusal).rejects.toThrow(CAST_TWO_REFERENCE_MISSING);
  await expect(refusal).rejects.toMatchObject({ name: "CastSetupGap" });
  expect(reserveGpu).not.toHaveBeenCalled();
});

test("two characters on ComfyUI's Autogrow Qwen node pass the second-image check and render", async () => {
  const f = setup(), source = visualFixture(), defaults = defaultGlobalSettings(), builder = { baseSet: "base", box: source.box, models: { diffusion: "qwen", encoder: "encoder", vae: "vae" }, steps: 25 };
  jest.mocked(getGlobalSettings).mockReturnValue({ ...defaults, sprites: { ...defaults.sprites, visualSources: { Synthetic: source, Second: { ...visualFixture(), character: "Second" } }, builders: { Synthetic: builder, Second: builder } } });
  jest.mocked(spriteCast).mockReturnValue({ chatId: "chat", groupId: "group", members: ["Synthetic", "Second"].map((name) => ({ name, folder: name, avatar: `${name}.png`, profile: {}, muted: false })) });
  const recorded = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/comfy-qwen21-autogrow.object_info.json"), "utf8"));
  jest.mocked(comfyDiscover).mockResolvedValue({ nodes: { ...Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), TextEncodeQwenImage21: recorded.TextEncodeQwenImage21 },
    checkpoints: [], embeddings: [], loras: [], upscalers: [], diffusionModels: ["qwen"], textEncoders: ["encoder"], vaes: ["vae"] });
  const manager = { ...f.manager, getStory: () => ({ roster: [{ id: "synthetic", name: "Synthetic" }, { id: "second", name: "Second" }], cardFieldByQuality: {} }) } as unknown as RuntimeManager;
  await expect(drawPreparedCast(manager, f.queue, ["Synthetic", "Second"], "")).resolves.toBe("/images/synthetic.png");
  const graph = jest.mocked(comfyRenderOwned).mock.calls[0][0] as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  expect(Object.keys(Object.values(graph).find((node) => node.class_type === "TextEncodeQwenImage21")!.inputs).filter((key) => key.startsWith("images."))).toEqual(["images.image_1", "images.image_2"]);
});

test("cast pipeline uploads image bytes, places accepted-lineage metadata and releases owned resources", async () => {
  const f = setup(); await expect(drawPreparedCast(f.manager, f.queue, ["Synthetic"], "A fountain")).resolves.toBe("/images/synthetic.png");
  expect(comfyReference).toHaveBeenCalledWith("encoded-reference-bytes", expect.any(AbortSignal));
  expect(imagePlace).toHaveBeenCalledWith("chat", 0, "Prepared cast illustration", expect.objectContaining({ image_director: expect.objectContaining({ purpose: "cast-scene" }) }), "inline");
  expect(releaseGpu).toHaveBeenCalledWith("owned-lease"); expect(comfyReleaseReference).toHaveBeenCalledWith("owned-ref.png");
});

test.each(["chat", "source", "cancel"])("%s during render discards the result before saving or placement and releases resources", async (event) => {
  const f = setup(); jest.mocked(comfyRenderOwned).mockImplementation(async () => {
    if (event === "chat") f.lapse(); if (event === "source") jest.mocked(sourceStillCurrent).mockReturnValue(false); if (event === "cancel") f.queue.cancelAll();
    return { data: "late", format: "png" };
  });
  await expect(drawPreparedCast(f.manager, f.queue, ["Synthetic"], "")).rejects.toThrow();
  expect(imageSave).not.toHaveBeenCalled(); expect(imagePlace).not.toHaveBeenCalled(); expect(releaseGpu).toHaveBeenCalledWith("owned-lease");
  expect(comfyReleaseReference).toHaveBeenCalledWith("owned-ref.png");
});

test("a reference release that throws still releases the GPU lease", async () => {
  const f = setup(); jest.mocked(comfyReleaseReference).mockRejectedValue(new Error("network"));
  await expect(drawPreparedCast(f.manager, f.queue, ["Synthetic"], "")).rejects.toThrow("network");
  expect(releaseGpu).toHaveBeenCalledWith("owned-lease");
});

test("cancel during media save removes the unplaced image", async () => {
  const f = setup(); jest.mocked(imageSave).mockImplementation(async () => { f.queue.cancelAll(); return "/images/late.png"; });
  await expect(drawPreparedCast(f.manager, f.queue, ["Synthetic"], "")).rejects.toThrow();
  expect(imagePlace).not.toHaveBeenCalled(); expect(imageDelete).toHaveBeenCalledWith("/images/late.png");
});

test.each(["refused", "threw"])("a cleanup that %s is logged and the original refusal still surfaces", async (outcome) => {
  const f = setup(); const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.mocked(imageSave).mockImplementation(async () => { f.queue.cancelAll(); return "/images/late.png"; });
  if (outcome === "refused") jest.mocked(imageDelete).mockResolvedValue({ ok: false, reason: "ST did not remove the unused image (500)." });
  else jest.mocked(imageDelete).mockRejectedValue(new Error("network down"));
  await expect(drawPreparedCast(f.manager, f.queue, ["Synthetic"], "")).rejects.not.toThrow(/network down|did not remove/);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("/images/late.png was not removed"));
  warn.mockRestore();
});

test("a cast scene waits for a look still being prepared, and refuses once the wait runs out or the run is gone", async () => {
  const source = visualFixture(), fields = { outfit: "blue coat" };
  const ready = publishVisualLook(source, visualRoot(source), "look_blue", lookSignature(fields), { ...source.base, sha256: "e".repeat(64) });
  const reads = [source, source, ready];
  let clock = 0;
  const settled = await settledLooks(() => [{ character: "Synthetic", fields, source: reads.shift() ?? ready }], { stillOwns: () => true }, 10_000,
    async () => { clock += 3_000; }, () => clock);
  expect(settled.identities[0].signature).toBe(lookSignature(fields));
  clock = 0;
  await expect(settledLooks(() => [{ character: "Synthetic", fields, source }], { stillOwns: () => true }, 5_000, async () => { clock += 3_000; }, () => clock))
    .rejects.toBeInstanceOf(LookPending);
  let owns = true;
  await expect(settledLooks(() => [{ character: "Synthetic", fields, source }], { stillOwns: () => owns }, 60_000, async () => { owns = false; }, () => 0))
    .rejects.toThrow("Request the cast scene again");
  await expect(settledLooks(() => [], { stillOwns: () => true })).rejects.toThrow("Choose one or two");
});

describe("visual bridge: prepared cast from packs", () => {
  const ROOT = join(__dirname, "../..");
  const pack = (name: string) => JSON.parse(readFileSync(join(ROOT, `test/fixtures/visual-packs/${name}.pack.json`), "utf8")) as { assets: Array<{ path: string; sha256: string }> };
  const NAMES = ["style-ink", "identity-wanderer", "identity-wanderer-r2", "place-harbor", "place-observatory"];
  const textHash = async (text: string) => createHash("sha256").update(text).digest("hex");
  const packSetup = () => {
    const f = setup(), defaults = defaultGlobalSettings();
    const story = parseStoryOrThrow(JSON.parse(readFileSync(join(ROOT, "test/fixtures/visual-bridge.story.json"), "utf8")));
    const files = new Map(NAMES.flatMap((name) => pack(name).assets.map((asset) => [asset.path, asset.sha256] as const)));
    let names = NAMES;
    jest.mocked(visualBridge).mockReturnValue(createVisualBridge({ textHash, list: async () => names.map((name) => ({ file: name, pack: pack(name) })),
      fileHash: async (path) => files.get(path) ?? Promise.reject(new Error("404")) }));
    jest.mocked(getGlobalSettings).mockReturnValue({ ...defaults, sprites: { ...defaults.sprites, visualSources: {}, builders: {}, sceneRecipe: null } });
    jest.mocked(spriteCast).mockReturnValue({ chatId: "chat", groupId: "group", members: [{ name: "Wanderer", folder: "Wanderer", avatar: "Wanderer.png", profile: {}, muted: false }] });
    jest.mocked(comfyDiscover).mockResolvedValue({ nodes: Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), checkpoints: [], embeddings: [], loras: [], upscalers: [],
      diffusionModels: ["qwen_image_2.1_int8_convrot.safetensors", "qwen_image_2.1_turbo_int8.safetensors", "other_unet.safetensors"],
      textEncoders: ["qwen3vl_8b_int8.safetensors", "clip_l.safetensors"], vaes: ["qwen_image_2.1_vae.safetensors", "sdxl_vae.safetensors"] });
    const base = pack("identity-wanderer").assets[0];
    jest.mocked(decodeImage).mockResolvedValue({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4), sha256: base.sha256 });
    const manager = { ...f.manager, getStory: () => story, getCachedSnapshot: () => ({ blackboard: {}, activeCheckpointId: "quay" }),
      getEngineState: () => ({ visitedPath: [] }) } as unknown as RuntimeManager;
    return { ...f, manager, files, replace: (next: string[]) => { names = next; } };
  };

  test("missing builders with valid packs: the pack look is the reference and the discovered Qwen route renders it, both recorded", async () => {
    const f = packSetup();
    await expect(drawPreparedCast(f.manager, f.queue, ["Wanderer"], "At the quay")).resolves.toBe("/images/synthetic.png");
    const graph = jest.mocked(comfyRenderOwned).mock.calls[0][0] as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(Object.values(graph).find((node) => node.class_type === "UNETLoader")?.inputs.unet_name).toBe("qwen_image_2.1_int8_convrot.safetensors");
    expect(decodeImage).toHaveBeenCalledWith("/characters/Wanderer/pack/default_neutral.png");
    expect(spriteFileFingerprint).not.toHaveBeenCalled();
    const media = jest.mocked(imagePlace).mock.calls[0][3] as { image_director: Record<string, unknown> };
    expect(media.image_director).toMatchObject({ recipe_source: "discovered", identities: [expect.objectContaining({ root: expect.stringMatching(/^pack:fixture-wanderer@/) })],
      visual: expect.objectContaining({ subjects: [expect.objectContaining({ member: "wanderer", source: "pack", look: "default", substituted: false })] }) });
  });

  test("an install-wide scene recipe wins over discovery, and no recipe at all is refused by name before any lease", async () => {
    const f = packSetup(), defaults = defaultGlobalSettings();
    const install = { models: { diffusion: "qwen", encoder: "encoder", vae: "vae" }, steps: 12 };
    jest.mocked(getGlobalSettings).mockReturnValue({ ...defaults, sprites: { ...defaults.sprites, visualSources: {}, builders: {}, sceneRecipe: install } });
    jest.mocked(comfyDiscover).mockResolvedValue({ nodes: Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), checkpoints: [], embeddings: [], loras: [], upscalers: [],
      diffusionModels: ["qwen"], textEncoders: ["encoder"], vaes: ["vae"] });
    await drawPreparedCast(f.manager, f.queue, ["Wanderer"], "");
    expect((jest.mocked(imagePlace).mock.calls[0][3] as { image_director: Record<string, unknown> }).image_director.recipe_source).toBe("install");
    jest.clearAllMocks();
    const g = packSetup();
    jest.mocked(comfyDiscover).mockResolvedValue({ nodes: Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), checkpoints: [], embeddings: [], loras: [], upscalers: [],
      diffusionModels: ["qwen"], textEncoders: ["encoder"], vaes: ["vae"] });
    await expect(drawPreparedCast(g.manager, g.queue, ["Wanderer"], "")).rejects.toThrow(SCENE_RECIPE_MISSING);
    await expect(drawPreparedCast(g.manager, g.queue, ["Wanderer"], "")).rejects.toMatchObject({ name: "CastSetupGap", player: PLAYER_COPY.castSetup });
    expect(reserveGpu).not.toHaveBeenCalled();
  });

  test("a refused or missing pack with no prepared source is refused by its precise reason, with specific player copy, before any lease", async () => {
    const f = packSetup();
    f.files.set("/characters/Wanderer/pack/default_neutral.png", "9".repeat(64));
    const changed = drawPreparedCast(f.manager, f.queue, ["Wanderer"], "");
    await expect(changed).rejects.toThrow(/^Wanderer's visual pack fixture-wanderer@[0-9a-f]{12} was refused: its look images no longer match the hashes it records\./);
    await expect(changed).rejects.toMatchObject({ name: "CastSetupGap", player: PLAYER_COPY.castArtChanged });
    jest.clearAllMocks();
    const g = packSetup();
    g.replace(["style-ink", "place-harbor", "place-observatory"]);
    const missing = drawPreparedCast(g.manager, g.queue, ["Wanderer"], "");
    await expect(missing).rejects.toThrow(/^Wanderer's visual pack fixture-wanderer@[0-9a-f]{12} is not installed, or the catalog refused it/);
    await expect(missing).rejects.toMatchObject({ name: "CastSetupGap", player: PLAYER_COPY.castArtMissing });
    expect(reserveGpu).not.toHaveBeenCalled();
  });

  test("a pack replaced mid-render, or its file changed under the same name, discards the picture before saving or placement", async () => {
    for (const change of ["catalog", "file"] as const) {
      jest.clearAllMocks();
      const f = packSetup();
      jest.mocked(comfyRenderOwned).mockImplementation(async () => {
        if (change === "catalog") f.replace(["style-ink", "identity-wanderer-r2", "place-harbor", "place-observatory"]);
        else f.files.set("/characters/Wanderer/pack/default_neutral.png", "9".repeat(64));
        return { data: "late", format: "png" };
      });
      await expect(drawPreparedCast(f.manager, f.queue, ["Wanderer"], "")).rejects.toMatchObject({ name: "CastSetupGap", message: PACK_CHANGED, player: PLAYER_COPY.castRetry });
      expect(imageSave).not.toHaveBeenCalled(); expect(imagePlace).not.toHaveBeenCalled();
      expect(releaseGpu).toHaveBeenCalledWith("owned-lease"); expect(comfyReleaseReference).toHaveBeenCalledWith("owned-ref.png");
    }
  });
});

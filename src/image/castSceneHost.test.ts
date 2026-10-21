import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import { drawPreparedCast } from "./castSceneHost";
import { CAST_TWO_REFERENCE_MISSING } from "./castScene";
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
jest.mock("../sprites/builder/textPriority", () => ({ waitForTextPriority: jest.fn() }));
jest.mock("@services/stHost/generation", () => ({ isHostGenerating: () => false }));
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

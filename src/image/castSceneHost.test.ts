import { webcrypto } from "node:crypto";
import { drawPreparedCast } from "./castSceneHost";
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
  const manager = { getOwnership: () => ({ mint: () => ({ chatId: "chat", storyId: "story", storyHash: "hash", sessionEpoch: 1, windowRevision: 0, window: null }),
    check: () => owns ? { ok: true } : { ok: false, reason: "chat", detail: "changed" } }),
  getStory: () => ({ roster: [{ id: "synthetic", name: "Synthetic" }], cardFieldByQuality: {} }),
  getCachedSnapshot: () => ({ blackboard: {} }), ownsImageChat: () => true } as unknown as RuntimeManager;
  return { manager, queue: new ImageQueue(), lapse: () => { owns = false; } };
};
beforeEach(() => jest.clearAllMocks());

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

test("cancel during media save removes the unplaced image", async () => {
  const f = setup(); jest.mocked(imageSave).mockImplementation(async () => { f.queue.cancelAll(); return "/images/late.png"; });
  await expect(drawPreparedCast(f.manager, f.queue, ["Synthetic"], "")).rejects.toThrow();
  expect(imagePlace).not.toHaveBeenCalled(); expect(imageDelete).toHaveBeenCalledWith("/images/late.png");
});

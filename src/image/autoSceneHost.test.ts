import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import { createVisualBridge } from "../sprites/packs/bridge";
import { visualBridge } from "../sprites/packs/bridgeHost";
import { EDIT_NODES } from "../sprites/builder/recipes";
import { comfyDiscover, comfyFingerprint, comfyReference, comfyReleaseReference, comfyRenderOwned } from "@services/stHost/media";
import { imageChat, imageSave, imageDelete } from "@services/stHost/image";
import { spriteCast } from "@services/stHost/sprites";
import { reserveGpu, releaseGpu } from "@services/stHost/gpuBroker";
import { getGlobalSettings } from "@runtime/settingsStore";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import { decodeImage } from "../sprites/builder/images";
import { hostGenerating } from "../sprites/builder/textPriority";
import { AUTO_CHANGED, AUTO_PACK_CHANGED, qwenCheck, renderAutomaticQwen } from "./autoSceneHost";
import { qwenPrompt } from "./autoScene";
import { withVisualScene } from "./visualPlan";
import type { ImagePlan } from "./runtime";
import type { RunGuard } from "@runtime/runToken";

jest.mock("@services/stHost/media", () => ({ comfyDiscover: jest.fn(), comfyFingerprint: jest.fn(), comfyReference: jest.fn(),
  comfyReleaseReference: jest.fn(), comfyRenderOwned: jest.fn(), spriteFileFingerprint: jest.fn() }));
jest.mock("@services/stHost/image", () => ({ imageChat: jest.fn(), imageSave: jest.fn(), imagePlace: jest.fn(), imageDelete: jest.fn() }));
jest.mock("@services/stHost/sprites", () => ({ spriteCast: jest.fn() }));
jest.mock("@services/stHost/gpuBroker", () => ({ reserveGpu: jest.fn(), releaseGpu: jest.fn(), renewGpu: jest.fn(), gpuBrokerStatus: jest.fn() }));
jest.mock("@runtime/settingsStore", () => ({ getGlobalSettings: jest.fn() }));
jest.mock("../sprites/builder/images", () => ({ decodeImage: jest.fn(), encodeImage: () => "encoded-reference-bytes" }));
jest.mock("../sprites/visualHost", () => ({ verifyVisualSource: jest.fn(), sourceStillCurrent: () => true }));
jest.mock("../sprites/builder/textPriority", () => ({ ...jest.requireActual("../sprites/builder/textPriority"), waitForTextPriority: jest.fn(), hostGenerating: jest.fn() }));
jest.mock("../sprites/packs/bridgeHost", () => ({ visualBridge: jest.fn() }));
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const ROOT = join(__dirname, "../..");
const raw = (name: string) => JSON.parse(readFileSync(join(ROOT, `test/fixtures/visual-packs/${name}.pack.json`), "utf8")) as { assets: Array<{ path: string; sha256: string }> };
const NAMES = ["style-ink", "identity-wanderer", "identity-wanderer-r2", "place-harbor", "place-observatory"];
const autogrow = JSON.parse(readFileSync(join(ROOT, "test/fixtures/comfy-qwen21-autogrow.object_info.json"), "utf8")).TextEncodeQwenImage21;
const textHash = async (text: string) => createHash("sha256").update(text).digest("hex");
const STORY = JSON.parse(readFileSync(join(ROOT, "test/fixtures/visual-bridge.story.json"), "utf8")) as { roster: unknown[] };
const story: NormalizedStory = parseStoryOrThrow({ ...STORY, roster: [...STORY.roster, { id: "guide", name: "Guide", role: "A harbor guide" }] });
const messages = [{ name: "Player", mes: "Show me.", is_user: true, is_system: false }, { name: "Wanderer", mes: "She unrolls a map.", is_user: false, is_system: false },
  { name: "Player", mes: "Later line.", is_user: true, is_system: false }];

const setup = (offerPlate = true) => {
  const files = new Map(NAMES.flatMap((name) => raw(name).assets.map((asset) => [asset.path, asset.sha256] as const)));
  jest.mocked(visualBridge).mockReturnValue(createVisualBridge({ textHash, list: async () => NAMES.map((name) => ({ file: name, pack: raw(name) })),
    fileHash: async (path) => files.get(path) ?? Promise.reject(new Error("404")) }));
  const defaults = defaultGlobalSettings();
  jest.mocked(getGlobalSettings).mockReturnValue({ ...defaults, sprites: { ...defaults.sprites, visualSources: {}, builders: {}, sceneRecipe: null } });
  jest.mocked(spriteCast).mockReturnValue({ chatId: "chat", groupId: "group", members: ["Wanderer", "Keeper", "Guide"].map((name) => ({ name, folder: name, avatar: `${name}.png`, profile: {}, muted: false })) });
  jest.mocked(comfyDiscover).mockResolvedValue({ nodes: { ...Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), ...(offerPlate ? { TextEncodeQwenImage21: autogrow } : {}) },
    checkpoints: [], embeddings: [], loras: [], upscalers: [], diffusionModels: ["qwen_image_2.1_int8_convrot.safetensors"], textEncoders: ["qwen3vl_8b_int8.safetensors"],
    vaes: ["qwen_image_2.1_vae.safetensors"] });
  jest.mocked(comfyFingerprint).mockImplementation(async (_kind, name) => ({ name, sha256: "f".repeat(64), size: 1 }));
  jest.mocked(decodeImage).mockImplementation(async (path) => ({ width: 512, height: 1024, data: new Uint8ClampedArray(4), sha256: files.get(path) ?? "0" }));
  jest.mocked(comfyReference).mockImplementation(async () => `ref-${jest.mocked(comfyReference).mock.calls.length}.png`);
  jest.mocked(comfyRenderOwned).mockResolvedValue({ data: "png", format: "png" });
  jest.mocked(reserveGpu).mockResolvedValue({ lease: "lease", brokered: true });
  jest.mocked(releaseGpu).mockResolvedValue({ ok: true, released: true });
  jest.mocked(comfyReleaseReference).mockResolvedValue({ ok: true, released: true });
  jest.mocked(imageSave).mockResolvedValue("/user/images/qwen.png");
  jest.mocked(imageDelete).mockResolvedValue({ ok: true, path: "/user/images/qwen.png" });
  jest.mocked(hostGenerating).mockResolvedValue(false);
  const chat = { id: "chat", folder: "group", groupId: "group", userName: "Player", characters: [], messages: messages.map((row) => ({ ...row })) };
  jest.mocked(imageChat).mockReturnValue(chat);
  const values = { wanderer_outfit: "grey rain cloak" };
  const manager = { getStory: () => story, getSnapshot: () => ({ blackboard: values }) } as never;
  return { files, chat, manager, values };
};

const planFor = async (manager: never, values: Record<string, string>) => {
  const visual = await visualBridge().scene({ story, members: ["wanderer"], values, path: ["quay"], family: "sdxl-illustrious" }, { fresh: true });
  const check = await qwenCheck(story, visual, values);
  const ready = check(["Wanderer"]);
  if (!ready.ok) throw new Error(ready.detail);
  const scene = withVisualScene({ target: 1, focus: null, location: null, checkpoint: null, subjects: [{ key: "w", name: "Wanderer", appearance: "", focus: true }],
    messages: [{ name: "Wanderer", text: "She unrolls a map.", target: true }] }, visual);
  const prompt = qwenPrompt(ready.ready, scene, null, { text: "" });
  return { visual, check, plan: { chatId: "chat", target: 1, targetText: "She unrolls a map.", folder: "group", visual, aspect: "landscape",
    qwen: { ready: ready.ready, prompt } } as unknown as ImagePlan, manager };
};
const run = (owns = () => true) => ({ stillOwns: owns, signal: new AbortController().signal, release: () => undefined } as unknown as RunGuard);
beforeEach(() => jest.clearAllMocks());

describe("automatic pictures: who can be drawn from references", () => {
  it("a pack-bound member is ready, a narrator is never drawn, an unknown name or an unprepared member falls back by name", async () => {
    const { values } = setup();
    const visual = await visualBridge().scene({ story, members: ["wanderer", "guide"], values, path: ["quay"], family: "sdxl-illustrious" }, { fresh: true });
    const check = await qwenCheck(story, visual, values);
    const ready = check(["Wanderer", "Keeper"]);
    expect(ready.ok && ready.ready.names).toEqual(["Wanderer"]);
    expect(ready.ok && ready.ready.plate?.path).toBe("/backgrounds/fixture_harbor_day.png");
    expect(check(["Wanderer", "the visitor"])).toMatchObject({ ok: false, reason: "visible-not-in-cast" });
    expect(check(["Guide"])).toMatchObject({ ok: false, reason: "no-reference", detail: expect.stringMatching(/^Guide has no accepted base and bust and no identity pack\./) });
    expect(check(["Keeper"])).toMatchObject({ ok: false, reason: "no-one-visible" });
  });

  it("a visible name given as the roster id or one word of the card name resolves to that member", async () => {
    const { values } = setup();
    const named = parseStoryOrThrow({ ...STORY, roster: [...STORY.roster, { id: "guide", name: "SO-Test Guide", role: "A harbor guide" }, { id: "rook", name: "Rook Marrow", role: "A sailor" }] });
    jest.mocked(spriteCast).mockReturnValue({ chatId: "chat", groupId: "group", members: ["Wanderer", "SO-Test Guide", "Rook Marrow"].map((name) => ({ name, folder: name, avatar: `${name}.png`, profile: {}, muted: false })) });
    const visual = await visualBridge().scene({ story: named, members: ["wanderer", "guide", "rook"], values, path: ["quay"], family: "sdxl-illustrious" }, { fresh: true });
    const check = await qwenCheck(named, visual, values);
    expect(check(["Guide"])).toMatchObject({ ok: false, reason: "no-reference", detail: expect.stringMatching(/^SO-Test Guide has no accepted base and bust/) });
    expect(check(["Rook"])).toMatchObject({ ok: false, reason: "no-reference", detail: expect.stringMatching(/^Rook Marrow has no accepted base and bust/) });
    expect(check(["Marrow"])).toMatchObject({ ok: false, reason: "no-reference" });
    expect(check(["the visitor"])).toMatchObject({ ok: false, reason: "visible-not-in-cast" });
  });

  it("an unreachable ComfyUI is a recorded reason, not an error", async () => {
    const { values } = setup();
    jest.mocked(comfyDiscover).mockRejectedValue(new Error("down"));
    const visual = await visualBridge().scene({ story, members: ["wanderer"], values, path: ["quay"], family: "sdxl-illustrious" }, { fresh: true });
    const check = await qwenCheck(story, visual, values);
    expect(check(["Wanderer"])).toMatchObject({ ok: false, reason: "media-unavailable" });
  });

  it("D10: a stopped ComfyUI is woken by a discovery lease before the reference check", async () => {
    const { values } = setup();
    jest.mocked(comfyDiscover).mockRejectedValueOnce(new Error("fetch failed"));
    const visual = await visualBridge().scene({ story, members: ["wanderer"], values, path: ["quay"], family: "sdxl-illustrious" }, { fresh: true });
    const check = await qwenCheck(story, visual, values);
    expect(check(["Wanderer"]).ok).toBe(true);
    expect(jest.mocked(reserveGpu).mock.calls.map(([request]) => request?.workflowKey)).toEqual(["comfy-discovery"]);
    expect(jest.mocked(releaseGpu)).toHaveBeenCalledWith("lease");
    expect(jest.mocked(comfyDiscover)).toHaveBeenCalledTimes(2);
  });
});

describe("automatic pictures: the reference render", () => {
  it("renders the pack look plus the place plate with the scene instruction, at the reference's shape, and records the route facts", async () => {
    const { manager, values } = setup();
    const { plan } = await planFor(manager, values);
    const candidate = await renderAutomaticQwen(manager, plan, new AbortController().signal, run(), 77);
    const graph = jest.mocked(comfyRenderOwned).mock.calls[0][0] as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const encoder = Object.values(graph).find((node) => node.class_type === "TextEncodeQwenImage21")!.inputs;
    expect(Object.keys(encoder).filter((key) => key.startsWith("images."))).toEqual(["images.image_1", "images.image_2"]);
    expect(decodeImage).toHaveBeenNthCalledWith(1, "/characters/Wanderer/pack/rain_cloak_neutral.png");
    expect(decodeImage).toHaveBeenNthCalledWith(2, "/backgrounds/fixture_harbor_day.png");
    expect(encoder.prompt).toContain("the last reference image shows only the place");
    expect(encoder.prompt).toContain("current look: outfit: grey rain cloak");
    expect(encoder.prompt).toContain("Setting: Lantern harbor");
    expect((Object.values(graph).find((node) => node.class_type === "KSampler")!.inputs).seed).toBe(77);
    expect(candidate).toMatchObject({ path: "/user/images/qwen.png", seed: 77, width: 736, height: 1440, waitedMs: expect.any(Number),
      qwen: { checkpoint: "qwen_image_2.1_int8_convrot.safetensors", recipe_source: "discovered", plate: true, aspect: { requested: "landscape", drawn: "reference" } } });
  });

  it("a ComfyUI without a second image input draws one character without the plate", async () => {
    const { manager, values } = setup(false);
    const { plan } = await planFor(manager, values);
    expect(plan.qwen?.ready.plate).toBeNull();
    await renderAutomaticQwen(manager, plan, new AbortController().signal, run(), 1);
    const graph = jest.mocked(comfyRenderOwned).mock.calls[0][0] as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(Object.keys(Object.values(graph).find((node) => node.class_type === "TextEncodeQwenImage21")!.inputs).filter((key) => key.startsWith("images."))).toEqual(["images.image_1"]);
  });

  it("starts only outside a text turn and hands the lease back when the player sends before the render starts, recording the wait", async () => {
    const { manager, values } = setup();
    const { plan } = await planFor(manager, values);
    jest.mocked(hostGenerating).mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValue(false);
    jest.mocked(reserveGpu).mockResolvedValueOnce({ lease: "first", brokered: true }).mockResolvedValueOnce({ lease: "second", brokered: true });
    const candidate = await renderAutomaticQwen(manager, plan, new AbortController().signal, run(), 1);
    expect(reserveGpu).toHaveBeenCalledTimes(2);
    expect(jest.mocked(releaseGpu).mock.calls.map(([lease]) => lease)).toEqual(["first", "second"]);
    expect(jest.mocked(releaseGpu).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(reserveGpu).mock.invocationCallOrder[1]);
    expect(candidate.waitedMs).toBeGreaterThanOrEqual(450);
  });

  it("a pack file changed or the illustrated reply edited mid-render discards the picture before saving", async () => {
    for (const change of ["pack", "reply"] as const) {
      jest.clearAllMocks();
      const { manager, values, files, chat } = setup();
      const { plan } = await planFor(manager, values);
      jest.mocked(comfyRenderOwned).mockImplementation(async () => {
        if (change === "pack") files.set("/characters/Wanderer/pack/rain_cloak_neutral.png", "9".repeat(64));
        else chat.messages[1].mes = "Edited.";
        return { data: "late", format: "png" };
      });
      await expect(renderAutomaticQwen(manager, plan, new AbortController().signal, run(), 1)).rejects.toThrow(change === "pack" ? AUTO_PACK_CHANGED : AUTO_CHANGED);
      expect(imageSave).not.toHaveBeenCalled();
      expect(releaseGpu).toHaveBeenCalled();
    }
  });

  it("a run lost while saving removes the saved file", async () => {
    const { manager, values } = setup();
    const { plan } = await planFor(manager, values);
    let owns = true;
    jest.mocked(imageSave).mockImplementation(async () => { owns = false; return "/user/images/late.png"; });
    await expect(renderAutomaticQwen(manager, plan, new AbortController().signal, run(() => owns), 1)).rejects.toThrow(AUTO_CHANGED);
    expect(imageDelete).toHaveBeenCalledWith("/user/images/late.png");
  });
});

import { OnDemandLooks } from "./onDemand";
import { comfyDiscover, comfyFingerprint, spriteFileFingerprint, spriteManifest, spriteReferencePack, type SpriteManifest } from "@services/stHost/media";
import { spriteList } from "@services/stHost/sprites";
import { openImageBurst, releaseGpu, reserveGpu } from "@services/stHost/gpuBroker";
import { retryDefaultRecipe } from "../defaultRecipeHost";
import { testOwnership } from "../../../test/findings/testOwnership";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { defaultSpriteSettings, type SpriteSettings } from "../settings";
import { visualFixture } from "../visualFixtures";
import { lookSignature, publishVisualLook, visualRoot } from "../visualManifest";
import { setDefaultRecipe } from "../defaultRecipe";
import { EDIT_NODES } from "./recipes";
import type { SpriteBuildRequest } from "./builder";

jest.mock("@services/stHost/gpuBroker", () => ({ gpuBrokerStatus: jest.fn(), openImageBurst: jest.fn(), closeImageBurst: jest.fn(), reserveGpu: jest.fn(), releaseGpu: jest.fn() }));
jest.mock("@services/stHost/media", () => ({ comfyDiscover: jest.fn(), comfyFingerprint: jest.fn(), spriteFileFingerprint: jest.fn(), spriteManifest: jest.fn(), spriteReferencePack: jest.fn() }));
jest.mock("@services/stHost/sprites", () => ({ spriteList: jest.fn() }));
jest.mock("../defaultRecipeHost", () => ({ retryDefaultRecipe: jest.fn() }));
jest.mock("./textPriority", () => ({ hostGenerating: async () => false, waitForTextPriority: async () => undefined,
  leaseOutsideTurns: async ({ acquire }: { acquire(): Promise<unknown> }) => acquire() }));
const builds: SpriteBuildRequest[] = [];
jest.mock("./host", () => ({ createSpriteBuilder: () => ({ close: jest.fn(), cancel: jest.fn(),
  build: jest.fn(async (request: SpriteBuildRequest) => { builds.push(request); return { request, key: "k".repeat(64) }; }),
  save: jest.fn(async ({ request }: { request: SpriteBuildRequest }) => ({ path: `/characters/Synthetic/anim-${request.set}/${request.label}.${request.kind}.png`, sha256: "9".repeat(64) })) }) }));
jest.mock("../visualHost", () => ({ verifyVisualSource: jest.fn(), sourceStillCurrent: () => true, publishDerivedVisual: jest.fn() }));

const MODELS = { diffusion: "qwen.safetensors", encoder: "encoder.safetensors", vae: "vae.safetensors" };
const RECIPE = { models: MODELS, steps: 25, resolution: 1024 };
const DISCOVERY = { nodes: Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), checkpoints: [], embeddings: [], loras: [], upscalers: [],
  diffusionModels: [MODELS.diffusion], textEncoders: [MODELS.encoder], vaes: [MODELS.vae] };
const fixture = visualFixture(), navy = { outfit: "navy coat" };
const published = { path: "/characters/Synthetic/look_pub/neutral.png", sha256: "f".repeat(64), key: "pub-key", recipe: { id: "qwen21-look-edit", version: 1 } };
const FRAME_SHA = "a".repeat(64);
let sprites: SpriteSettings, comfyUp = false, framesCached = true;
const manager = { getOwnership: () => testOwnership(), getGlobalSettings: () => ({ sprites }), getCachedSnapshot: () => ({ storyId: "story-b" }) } as unknown as RuntimeManager;
const ask = async (fields: Record<string, string>) => {
  const failed = jest.fn(), apply = jest.fn();
  await new Promise<void>((resolve) => {
    apply.mockImplementation(() => resolve());
    failed.mockImplementation(() => resolve());
    new OnDemandLooks(manager).request({ member: "synthetic", folder: "Synthetic", label: "neutral", fields, accepts: () => true, apply, failed });
  });
  return { apply, failed };
};
const frameRow = { key: "frame", sha256: FRAME_SHA, recipe: published.recipe, qa: {}, status: "complete" as const, inputs: { base: published.sha256 } };

beforeEach(() => {
  builds.length = 0;
  comfyUp = false;
  framesCached = true;
  const source = publishVisualLook(fixture, visualRoot(fixture), "look_pub", lookSignature(navy), published);
  sprites = { ...defaultSpriteSettings(), onDemand: true, visualSources: { Synthetic: source }, builders: {} };
  setDefaultRecipe({ status: "unreachable", recipe: null, problem: "ComfyUI did not list its models: fetch failed" }, sprites);
  jest.mocked(openImageBurst).mockResolvedValue({ ok: true, burst: null });
  jest.mocked(comfyDiscover).mockReset().mockImplementation(async () => { if (!comfyUp) throw new Error("fetch failed"); return DISCOVERY; });
  jest.mocked(reserveGpu).mockReset().mockImplementation(async () => { comfyUp = true; return { lease: "wake", brokered: true }; });
  jest.mocked(releaseGpu).mockReset().mockResolvedValue({ ok: true, released: true });
  jest.mocked(retryDefaultRecipe).mockReset().mockImplementation(async () => { setDefaultRecipe({ status: "ready", source: "discovered", recipe: RECIPE, problem: null }, sprites); });
  jest.mocked(comfyFingerprint).mockImplementation(async (_kind, name) => ({ name, sha256: "8".repeat(64), size: 1 }));
  jest.mocked(spriteFileFingerprint).mockResolvedValue(FRAME_SHA);
  jest.mocked(spriteList).mockImplementation(async (folder) => folder.endsWith("anim-look_pub") && framesCached
    ? ["blink", "talk"].map((kind) => ({ label: `neutral.${kind}`, path: `/characters/Synthetic/anim-look_pub/neutral.${kind}.png` })) : []);
  jest.mocked(spriteReferencePack).mockImplementation(async (character, set) => ({ character, set, sha256: `${set}-pack`,
    files: set === "look_pub" ? [{ label: "neutral", path: published.path, sha256: published.sha256, width: 64, height: 96 }] : [] }));
  jest.mocked(spriteManifest).mockImplementation(async (character, set): Promise<SpriteManifest | null> => {
    if (set === "look_pub") return { owner: "story-orchestrator", version: 1, character, set,
      labels: { neutral: { key: published.key, sha256: published.sha256, recipe: published.recipe, qa: {}, status: "complete" } } };
    if (set === "anim-look_pub" && framesCached) return { owner: "story-orchestrator", version: 1, character, set,
      labels: { "neutral.blink": frameRow, "neutral.talk": frameRow } };
    return null;
  });
});

test("a published look with its frames is reused while ComfyUI is stopped and the Qwen route is unreachable: no discovery, no wake, no render", async () => {
  const { apply, failed } = await ask(navy);
  expect(failed).not.toHaveBeenCalled();
  expect(apply).toHaveBeenCalledWith("look_pub", [], { blink: "/characters/Synthetic/anim-look_pub/neutral.blink.png", talk: "/characters/Synthetic/anim-look_pub/neutral.talk.png" });
  expect(comfyDiscover).not.toHaveBeenCalled();
  expect(reserveGpu).not.toHaveBeenCalled();
  expect(builds).toEqual([]);
});

test("a reused look whose frames still need a render wakes ComfyUI through a GPU lease, re-checks the Qwen route, then renders only the frames", async () => {
  framesCached = false;
  const { apply, failed } = await ask(navy);
  expect(failed).not.toHaveBeenCalled();
  expect(reserveGpu).toHaveBeenCalledTimes(1);
  expect(jest.mocked(reserveGpu).mock.calls[0][0]).toMatchObject({ workflowKey: "comfy-discovery" });
  expect(releaseGpu).toHaveBeenCalledWith("wake");
  expect(retryDefaultRecipe).toHaveBeenCalledTimes(1);
  expect(builds.map((build) => build.kind)).toEqual(["blink", "talk"]);
  expect(apply.mock.calls[0][0]).toBe("look_pub");
});

test("a render whose wake leaves ComfyUI stopped fails with a precise status naming how to start it", async () => {
  framesCached = false;
  jest.mocked(reserveGpu).mockResolvedValue({ lease: null, brokered: false });
  const { apply, failed } = await ask(navy);
  expect(apply).not.toHaveBeenCalled();
  expect(failed.mock.calls[0][0]).toMatch(/^ComfyUI did not answer \(fetch failed\), and the GPU broker let the request through without starting it.*start-comfy/);
  expect(builds).toEqual([]);
});

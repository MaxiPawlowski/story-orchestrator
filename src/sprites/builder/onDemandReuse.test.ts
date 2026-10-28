import { OnDemandLooks } from "./onDemand";
import { comfyDiscover, comfyFingerprint, spriteManifest, spriteReferencePack } from "@services/stHost/media";
import { spriteList } from "@services/stHost/sprites";
import { openImageBurst } from "@services/stHost/gpuBroker";
import { publishDerivedVisual } from "../visualHost";
import { testOwnership } from "../../../test/findings/testOwnership";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { defaultSpriteSettings, type SpriteSettings } from "../settings";
import { visualFixture } from "../visualFixtures";
import { lookSignature, publishVisualLook, visualRoot } from "../visualManifest";
import { EDIT_NODES } from "./recipes";
import type { SpriteBuildRequest } from "./builder";

jest.mock("@services/stHost/gpuBroker", () => ({ gpuBrokerStatus: jest.fn(), openImageBurst: jest.fn(), closeImageBurst: jest.fn() }));
jest.mock("@services/stHost/media", () => ({ comfyDiscover: jest.fn(), comfyFingerprint: jest.fn(), spriteFileFingerprint: jest.fn(), spriteManifest: jest.fn(), spriteReferencePack: jest.fn() }));
jest.mock("@services/stHost/sprites", () => ({ spriteList: jest.fn() }));
jest.mock("./textPriority", () => ({ hostGenerating: () => false, waitForTextPriority: async () => undefined }));
const builds: SpriteBuildRequest[] = [];
jest.mock("./host", () => ({ createSpriteBuilder: () => ({ close: jest.fn(), cancel: jest.fn(),
  build: jest.fn(async (request: SpriteBuildRequest) => { builds.push(request); return { request, key: "k".repeat(64) }; }),
  save: jest.fn(async ({ request }: { request: SpriteBuildRequest }) => ({ path: `/characters/Synthetic/${request.set}/${request.label}.${request.kind}.png`, sha256: "9".repeat(64) })) }) }));
jest.mock("../visualHost", () => ({ verifyVisualSource: jest.fn(), sourceStillCurrent: () => true, publishDerivedVisual: jest.fn() }));

const MODELS = { diffusion: "qwen.safetensors", encoder: "encoder.safetensors", vae: "vae.safetensors" };
const config = (steps: number) => ({ baseSet: "base", box: { x: 8, y: 8, width: 32, height: 32 }, models: MODELS, steps });
const fixture = visualFixture(), navy = { outfit: "navy coat" };
const published = { path: "/characters/Synthetic/look_pub/neutral.png", sha256: "f".repeat(64), key: "pub-key", recipe: { id: "qwen21-look-edit", version: 1 } };
let sprites: SpriteSettings, story = "story-a";
const manager = { getOwnership: () => testOwnership(), getGlobalSettings: () => ({ sprites }), getCachedSnapshot: () => ({ storyId: story }) } as unknown as RuntimeManager;
const ask = async (fields: Record<string, string>) => {
  const failed = jest.fn();
  let done: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => { done = resolve; });
  const apply = jest.fn((_set: string, _files: unknown, _frames?: unknown) => done());
  failed.mockImplementation(() => done());
  new OnDemandLooks(manager).request({ member: "synthetic", folder: "Synthetic", label: "neutral", fields, accepts: () => true, apply, failed });
  await settled;
  expect(failed).not.toHaveBeenCalled();
  return apply;
};

beforeEach(() => {
  builds.length = 0;
  jest.mocked(publishDerivedVisual).mockReset();
  const source = publishVisualLook(fixture, visualRoot(fixture), "look_pub", lookSignature(navy), published);
  sprites = { ...defaultSpriteSettings(), onDemand: true, visualSources: { Synthetic: source }, builders: { Synthetic: config(25) } };
  jest.mocked(openImageBurst).mockResolvedValue({ ok: true, burst: null });
  jest.mocked(comfyDiscover).mockResolvedValue({ nodes: Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), checkpoints: [], embeddings: [], loras: [], upscalers: [],
    diffusionModels: [MODELS.diffusion], textEncoders: [MODELS.encoder], vaes: [MODELS.vae] });
  jest.mocked(comfyFingerprint).mockImplementation(async (_kind, name) => ({ name, sha256: "8".repeat(64), size: 1 }));
  jest.mocked(spriteList).mockResolvedValue([]);
  jest.mocked(spriteReferencePack).mockImplementation(async (character, set) => ({ character, set, sha256: `${set}-pack`,
    files: set === "look_pub" ? [{ label: "neutral", path: published.path, sha256: published.sha256, width: 64, height: 96 }] : [] }));
  jest.mocked(spriteManifest).mockImplementation(async (character, set) => set === "look_pub" ? { owner: "story-orchestrator", version: 1, character, set,
    labels: { neutral: { key: published.key, sha256: published.sha256, recipe: published.recipe, qa: {}, status: "complete" } } } : null);
});

test("an outfit already published for this visual root is reused under another story and another builder config, never rendered or published again", async () => {
  const first = await ask(navy);
  expect(first).toHaveBeenCalledWith("look_pub", [], expect.anything());
  story = "story-b";
  sprites = { ...sprites, builders: { Synthetic: config(40) } };
  const second = await ask(navy);
  expect(second).toHaveBeenCalledWith("look_pub", [], expect.anything());
  expect(builds.filter((build) => build.kind === "look")).toEqual([]);
  expect(publishDerivedVisual).not.toHaveBeenCalled();
});

test("a genuinely new outfit still renders and publishes its look", async () => {
  const apply = await ask({ outfit: "red coat" });
  expect(builds.filter((build) => build.kind === "look")).toHaveLength(1);
  expect(publishDerivedVisual).toHaveBeenCalledTimes(1);
  expect(apply.mock.calls[0][0]).toMatch(/^look_[a-f0-9]{8}$/);
});

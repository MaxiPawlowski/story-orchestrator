import { OnDemandLooks, ON_DEMAND_OFF } from "./onDemand";
import { comfyDiscover } from "@services/stHost/media";
import { openImageBurst } from "@services/stHost/gpuBroker";
import { testOwnership } from "../../../test/findings/testOwnership";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { defaultSpriteSettings, type SpriteSettings } from "../settings";
import { visualFixture } from "../visualFixtures";
import { discoveryProblem, setDefaultRecipe } from "../defaultRecipe";

jest.mock("@services/stHost/gpuBroker", () => ({ gpuBrokerStatus: jest.fn(), openImageBurst: jest.fn(), closeImageBurst: jest.fn() }));
jest.mock("@services/stHost/media", () => ({ comfyDiscover: jest.fn(), comfyFingerprint: jest.fn(), spriteFileFingerprint: jest.fn(), spriteManifest: jest.fn(), spriteReferencePack: jest.fn() }));
jest.mock("@services/stHost/sprites", () => ({ spriteList: jest.fn() }));
jest.mock("./host", () => ({ createSpriteBuilder: () => ({ close: jest.fn(), cancel: jest.fn() }) }));
jest.mock("../visualHost", () => ({ verifyVisualSource: jest.fn(), sourceStillCurrent: () => true, publishDerivedVisual: jest.fn() }));

let sprites: SpriteSettings;
const manager = { getOwnership: () => testOwnership(), getGlobalSettings: () => ({ sprites }), getCachedSnapshot: () => ({ storyId: "s" }) } as unknown as RuntimeManager;
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const NO_QWEN = { diffusionModels: [], textEncoders: [], vaes: [] };
const RECIPE = { models: { diffusion: "qwen_image_2.1_int8_convrot.safetensors", encoder: "qwen3vl_8b_int8_convrot.safetensors", vae: "qwen_image_2.1_vae_bf16.safetensors" }, steps: 25, resolution: 1024 };
const ask = (looks: OnDemandLooks, outfit: string) => {
  const failed = jest.fn();
  looks.request({ member: "synthetic", folder: "Synthetic", label: "neutral", fields: { outfit }, accepts: () => true, apply: jest.fn(), failed });
  return failed;
};

beforeEach(() => {
  sprites = { ...defaultSpriteSettings(), onDemand: true, visualSources: { Synthetic: visualFixture() }, builders: {} };
  setDefaultRecipe({ status: "unchecked", recipe: null, problem: null }, sprites);
  jest.mocked(openImageBurst).mockResolvedValue({ ok: true, burst: null });
  jest.mocked(comfyDiscover).mockReset().mockRejectedValue(new Error("reached the Qwen route"));
});

test("a changed look asked before the install-wide Qwen route resolves waits for it, then runs on the resolved route", async () => {
  const looks = new OnDemandLooks(manager), failed = ask(looks, "yellow oilskin coat");
  await tick();
  expect(failed).not.toHaveBeenCalled();
  expect(comfyDiscover).not.toHaveBeenCalled();
  setDefaultRecipe({ status: "ready", source: "discovered", recipe: RECIPE, problem: null }, sprites);
  await tick();
  expect(comfyDiscover).toHaveBeenCalledTimes(1);
  expect(failed).toHaveBeenCalledWith("reached the Qwen route");
});

test("a route that resolves missing names the real gap, and on-demand switched off says so instead of asking for a reference pack", async () => {
  const looks = new OnDemandLooks(manager), failed = ask(looks, "red coat");
  await tick();
  const problem = discoveryProblem(NO_QWEN);
  setDefaultRecipe({ status: "missing", recipe: null, problem }, sprites);
  await tick();
  expect(failed).toHaveBeenCalledWith(problem);
  expect(comfyDiscover).not.toHaveBeenCalled();
  sprites = { ...sprites, onDemand: false };
  const off = ask(new OnDemandLooks(manager), "blue coat");
  await tick();
  expect(off).toHaveBeenCalledWith(ON_DEMAND_OFF);
});

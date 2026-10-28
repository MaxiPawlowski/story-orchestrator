import { builderGap, defaultRecipe, discoveryProblem, resolveDefaultRecipe, setDefaultRecipe, withDefaultBuilders } from "./defaultRecipe";
import { defaultSpriteSettings, type SpriteSettings } from "./settings";
import { visualFixture } from "./visualFixtures";
import { changedLookIssues } from "./lookHealth";
import { spriteRecipeHealth } from "@runtime/spriteRecipeHealth";
import { CHECKS, runCheck, type Check } from "@runtime/checks";
import type { RuntimeSnapshot } from "@runtime/types";
import { parseStoryOrThrow } from "@engine/index";

const OWNER_LIKE = { diffusionModels: ["qwen_image_2.1_int8_convrot.safetensors", "qwen_image_2.1_turbo_int8.safetensors", "waiIllustriousSDXL.safetensors"],
  textEncoders: ["qwen3vl_8b_int8.safetensors", "clip_l.safetensors"], vaes: ["qwen_image_2.1_vae.safetensors", "sdxl_vae.safetensors"] };
const NO_QWEN = { diffusionModels: ["waiIllustriousSDXL.safetensors"], textEncoders: ["clip_l.safetensors"], vaes: ["sdxl_vae.safetensors"] };
const prepared = (): SpriteSettings => ({ ...defaultSpriteSettings(), visualSources: { Synthetic: visualFixture() }, builders: {} });
const deps = (discovery: typeof OWNER_LIKE, fingerprint = jest.fn(async () => ({})) as jest.Mock) => ({ discover: async () => discovery, fingerprint });

afterEach(() => setDefaultRecipe({ status: "unchecked", recipe: null, problem: null }, prepared()));

describe("visual bridge: install-wide default Qwen recipe", () => {
  it("empty builders + the discovered route: every accepted visual source gets a builder derived from its own base set and head box, verified by fingerprint", async () => {
    const fingerprint = jest.fn(async () => ({}));
    const resolved = await resolveDefaultRecipe(prepared(), deps(OWNER_LIKE, fingerprint));
    expect(resolved).toEqual({ status: "ready", source: "discovered", problem: null,
      recipe: { models: { diffusion: "qwen_image_2.1_int8_convrot.safetensors", encoder: "qwen3vl_8b_int8.safetensors", vae: "qwen_image_2.1_vae.safetensors" }, steps: 25, resolution: 1024 } });
    expect(fingerprint.mock.calls).toEqual([["diffusionModels", "qwen_image_2.1_int8_convrot.safetensors"], ["textEncoders", "qwen3vl_8b_int8.safetensors"], ["vaes", "qwen_image_2.1_vae.safetensors"]]);
    setDefaultRecipe(resolved, prepared());
    const source = visualFixture(), effective = withDefaultBuilders(prepared());
    expect(effective.builders.Synthetic).toEqual({ baseSet: source.baseSet, box: source.box, models: resolved.recipe?.models, steps: 25, resolution: 1024 });
    expect(builderGap(effective, "Synthetic")).toBeNull();
    const own = { ...prepared(), builders: { Synthetic: { baseSet: "pack", box: { x: 1, y: 1, width: 9, height: 9 }, models: { diffusion: "a", encoder: "b", vae: "c" }, steps: 9 } } };
    expect(withDefaultBuilders(own).builders.Synthetic.baseSet).toBe("pack");
    expect(prepared().builders).toEqual({});
  });

  it("the owner's ComfyUI (two Qwen generations side by side) pairs the 2.1 edit model with the Qwen3-VL encoder and the 2.1 VAE; a second 2.1 file names its candidates", async () => {
    const owner = { diffusionModels: ["qwen_image_2.1_int8_convrot.safetensors", "qwen_image_2.1_turbo_int8_convrot.safetensors", "qwen_image_2512_fp8_e4m3fn.safetensors"],
      textEncoders: ["qwen3vl_8b_int8_convrot.safetensors", "qwen_2.5_vl_7b_fp8_scaled.safetensors"], vaes: ["qwen_image_2.1_vae_bf16.safetensors", "qwen_image_vae.safetensors"] };
    expect(await resolveDefaultRecipe(prepared(), deps(owner))).toMatchObject({ status: "ready", source: "discovered", problem: null,
      recipe: { models: { diffusion: "qwen_image_2.1_int8_convrot.safetensors", encoder: "qwen3vl_8b_int8_convrot.safetensors", vae: "qwen_image_2.1_vae_bf16.safetensors" } } });
    expect(discoveryProblem(owner)).toBeNull();
    expect(discoveryProblem({ ...owner, textEncoders: ["qwen_2.5_vl_7b_fp8_scaled.safetensors"] })).toBe("ComfyUI offers no Qwen3-VL text encoder (Qwen Image 2.1) "
      + "(its other Qwen text encoders, qwen_2.5_vl_7b_fp8_scaled.safetensors, belong to another Qwen generation). Install the missing files, or set sprites.sceneRecipe to choose one.");
    const twoVaes = { ...owner, vaes: [...owner.vaes, "qwen_image_2.1_vae_fp16.safetensors"] };
    expect(await resolveDefaultRecipe(prepared(), deps(twoVaes))).toMatchObject({ status: "missing", recipe: null, problem: "ComfyUI offers more than one Qwen Image 2.1 VAE "
      + "(qwen_image_2.1_vae_bf16.safetensors, qwen_image_2.1_vae_fp16.safetensors). Install the missing files, or set sprites.sceneRecipe to choose one." });
  });

  it("an install-wide sprites.sceneRecipe wins over discovery and is still fingerprinted", async () => {
    const sceneRecipe = { models: { diffusion: "mine.safetensors", encoder: "enc.safetensors", vae: "vae.safetensors" }, steps: 12 };
    const discover = jest.fn();
    const resolved = await resolveDefaultRecipe({ sceneRecipe }, { discover, fingerprint: async () => ({}) });
    expect(resolved).toMatchObject({ status: "ready", source: "install", recipe: sceneRecipe });
    expect(discover).not.toHaveBeenCalled();
  });

  it("no Qwen models installed: no builder is invented, the gap is named, and a Repair row lists the waiting characters", async () => {
    const resolved = await resolveDefaultRecipe(prepared(), deps(NO_QWEN));
    expect(resolved.status).toBe("missing");
    expect(resolved.problem).toBe(discoveryProblem(NO_QWEN));
    expect(resolved.problem).toMatch(/no Qwen Image 2\.1 edit diffusion model, no Qwen3-VL text encoder \(Qwen Image 2\.1\), no Qwen Image 2\.1 VAE\./);
    setDefaultRecipe(resolved, prepared());
    expect(withDefaultBuilders(prepared()).builders).toEqual({});
    expect(builderGap(prepared(), "Synthetic")).toBe(resolved.problem);
    expect(builderGap(prepared(), "Unprepared")).toMatch(/No accepted base and bust/);
    const check = CHECKS.find((row) => row.id === "sprite-qwen-route-missing") as Check;
    const finding = runCheck(check, { spriteRecipe: spriteRecipeHealth() } as unknown as RuntimeSnapshot);
    expect(finding?.detail).toContain("Waiting: Synthetic.");
    expect(finding?.detail).toContain("no Qwen Image 2.1 VAE");
    expect(runCheck(check, { spriteRecipe: { ...spriteRecipeHealth(), status: "ready" } } as unknown as RuntimeSnapshot)).toBeNull();
  });

  it("ambiguous files, an unreachable ComfyUI and an unfingerprintable model each say what is wrong; only a real gap raises the row", async () => {
    expect(discoveryProblem({ ...OWNER_LIKE, vaes: ["qwen_image_2.1_vae_a.safetensors", "qwen_image_2.1_vae_b.safetensors"] }))
      .toMatch(/more than one Qwen Image 2\.1 VAE \(qwen_image_2\.1_vae_a\.safetensors, qwen_image_2\.1_vae_b\.safetensors\)/);
    const down = await resolveDefaultRecipe(prepared(), { discover: async () => { throw new Error("media plugin absent"); }, fingerprint: async () => ({}) });
    expect(down).toMatchObject({ status: "unreachable", recipe: null });
    const unprinted = await resolveDefaultRecipe(prepared(), deps(OWNER_LIKE, jest.fn(async () => { throw new Error("not under modelRoots"); })));
    expect(unprinted).toMatchObject({ status: "missing", recipe: null });
    expect(unprinted.problem).toMatch(/modelRoots/);
    setDefaultRecipe(down, prepared());
    expect(defaultRecipe().status).toBe("unreachable");
    expect(runCheck(CHECKS.find((row) => row.id === "sprite-qwen-route-missing") as Check, { spriteRecipe: spriteRecipeHealth() } as unknown as RuntimeSnapshot)).toBeNull();
  });

  it("the changed-look Repair row names the real gap instead of asking for a reference pack", async () => {
    const story = parseStoryOrThrow({ id: "s", title: "T", description: "D", qualities: [{ key: "synthetic_coat", type: "string", source: "extractor", rubric: "Coat." }],
      checkpoints: [{ id: "a", name: "A", objective: "o", type: "anchor", start: true }], transitions: [],
      roster: [{ id: "synthetic", name: "Synthetic", card: { fields: { coat: { quality: "synthetic_coat", visual: true } } } }] });
    const actor = { name: "Synthetic", muted: false, profile: { folder: "Synthetic" }, rules: [] };
    setDefaultRecipe(await resolveDefaultRecipe(prepared(), deps(NO_QWEN)), prepared());
    expect(changedLookIssues(story, { synthetic_coat: "red coat" }, prepared(), true, [actor])).toEqual([{ name: "Synthetic", reason: discoveryProblem(NO_QWEN) }]);
    setDefaultRecipe(await resolveDefaultRecipe(prepared(), deps(OWNER_LIKE)), prepared());
    expect(changedLookIssues(story, { synthetic_coat: "red coat" }, withDefaultBuilders(prepared()), true, [actor])).toEqual([]);
  });
});

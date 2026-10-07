import type { AlphaRecipe, ComfyDiscovery, ModelFingerprint } from "@services/stHost/media";

export type EditKind = "expression" | "blink" | "talk" | "talk2" | "look" | "base" | "rest";
export interface EditModels { diffusion: ModelFingerprint; encoder: ModelFingerprint; vae: ModelFingerprint }
export interface EditParameters { models: EditModels; steps: number; seed: number; reference: string; instruction: string; cutout?: AlphaRecipe; resolution?: number }
export const EDIT_RECIPE = { id: "qwen21-face-edit", version: 4 } as const;
export const RENDER_RECIPE = { id: "qwen21-edit", version: 4 } as const;
export const BASE_RECIPE = { id: "qwen21-card-base", version: 2 } as const;
export const REST_RECIPE = { id: "qwen21-neutral-rest", version: 1 } as const;
export const EDIT_NODES = ["LoadImage", "UNETLoader", "QwenImage21Cache", "CLIPLoader", "VAELoader", "TextEncodeQwenImage21", "KSampler", "VAEDecode", "SaveImage"];
export const EXPRESSIONS = ["neutral", "happy", "angry", "worried"];

export function recipeProblems(discovery: ComfyDiscovery, models: { diffusion: string; encoder: string; vae: string }): string[] {
  return [
    ...EDIT_NODES.filter((node) => !discovery.nodes[node]).map((node) => `Missing ComfyUI node: ${node}.`),
    ...[["diffusion model", models.diffusion, discovery.diffusionModels], ["text encoder", models.encoder, discovery.textEncoders], ["VAE", models.vae, discovery.vaes]]
      .flatMap(([kind, selected, available]) => typeof selected === "string" && Array.isArray(available) && available.includes(selected) ? [] : [`Choose an installed ${String(kind)}.`]),
  ];
}

export const editInstruction = (kind: EditKind, value: string): string => {
  if (kind === "base") return "Draw this same character alone as a neutral standing character sprite. Preserve identity, face, hair, clothing, proportions and art style. "
    + "Show the whole visible subject without cropping the head or feet. Remove other characters, scenery, text and borders. Plain white background.";
  const change = kind === "rest" ? "the mouth into a clean relaxed closed-mouth resting pose. Lips gently together in one natural subtle line, "
    + "no visible teeth, tongue or gap, no doubled lip outline, no pout, smirk or frown. Preserve the original eyes, eyebrows, nose, cheeks, jaw, "
    + "mouth position and art style; keep the expression calm and natural"
    : kind === "blink" ? "eyes fully closed; preserve the mouth and emotion"
    : kind === "talk" ? ["neutral", "happy"].includes(value)
      ? "mouth visibly open as if speaking, with gently parted lips and natural mouth shading matching the reference's art style; preserve "
        + (value === "happy" ? "the reference's happy smile and its corners" : "the reference's existing gentle expression and mouth corners")
        + "; do not close or flatten the smile. Replace the original lip line completely, no second mouth or leftover line; "
        + "preserve nose, cheeks, jaw and eyes; not shouting or surprised"
      : "mouth open as if speaking; preserve the eyes and emotion"
      : kind === "talk2" ? "mouth slightly open as if speaking; preserve the eyes and emotion"
        : kind === "look" ? value : `facial expression: ${value}`;
  return `Same image, same character, same pose, head angle, framing, lighting and colours. Change only ${change}. Everything else stays identical. Plain white background.`;
};

export function editGraph(params: EditParameters): Record<string, unknown> {
  const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });
  return {
    "1": node("LoadImage", { image: params.reference }),
    "2": node("UNETLoader", { unet_name: params.models.diffusion.name, weight_dtype: "default" }),
    "3": node("QwenImage21Cache", { model: ["2", 0], device: "auto", dtype: "default" }),
    "4": node("CLIPLoader", { clip_name: params.models.encoder.name, type: "qwen_image", device: "default" }),
    "5": node("VAELoader", { vae_name: params.models.vae.name }),
    "6": node("TextEncodeQwenImage21", { clip: ["4", 0], prompt: params.instruction, negative_prompt: "text, watermark, different character, deformed face",
      vae: ["5", 0], resolution: params.resolution ?? 1024, "images.image_1": ["1", 0] }),
    "7": node("KSampler", { model: ["3", 0], seed: params.seed, steps: params.steps, cfg: 1, sampler_name: "euler", scheduler: "simple",
      positive: ["6", 0], negative: ["6", 1], latent_image: ["6", 2], denoise: 1 }),
    "8": node("VAEDecode", { samples: ["7", 0], vae: ["5", 0] }),
    "9": node("SaveImage", { filename_prefix: "so-sprite", images: ["8", 0] }),
    ...(params.cutout ? {
      "9": node("SplitImageWithAlpha", { image: ["8", 0] }),
      "10": node(params.cutout.node, { image: ["9", 0], model: params.cutout.model, background: "Alpha", sensitivity: 1,
        mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: false, background_color: "#ffffff" }),
      "11": node("SaveImage", { filename_prefix: "so-sprite-base", images: ["10", 0] }),
    } : {}),
  };
}

export async function contentHash(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Open SillyTavern on localhost or HTTPS to use the sprite builder’s image fingerprints.");
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function editKey(input: { base: string; models: EditModels; kind: EditKind; value: string; seed: number; steps: number;
  box: unknown; story?: string; member?: string; cutout?: AlphaRecipe; resolution?: number; frameRegion?: unknown }): Promise<string> {
  const recipe = input.kind === "base" ? BASE_RECIPE : input.kind === "rest" ? REST_RECIPE : EDIT_RECIPE;
  return contentHash(new TextEncoder().encode(JSON.stringify({ recipe, ...input })));
}

export async function renderKey(input: Parameters<typeof editKey>[0]): Promise<string> {
  return contentHash(new TextEncoder().encode(JSON.stringify({ recipe: input.kind === "rest" ? REST_RECIPE : RENDER_RECIPE, ...input, frameRegion: undefined })));
}

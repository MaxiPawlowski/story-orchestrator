export const ASPECTS = ["portrait", "square", "landscape", "wide"] as const;
export type Aspect = (typeof ASPECTS)[number];
export const SHOTS = ["close", "upper", "cowboy", "full", "wide", "pov", "from_above", "from_below"] as const;
export type Shot = (typeof SHOTS)[number];
export type Quality = "base" | "hires";
export type Purpose = "scene" | "character" | "portrait" | "user" | "background" | "free";
export type Placement = "inline" | "message" | "background";
export interface Size { width: number; height: number }
export interface Family {
  id: string;
  label: string;
  graph: "sdxl" | "flux";
  loraBase: "illustrious" | "flux";
  promptStyle: "tags" | "prose";
  sizes: Record<Aspect, Size>;
  upscaler: string;
}
export interface Checkpoint {
  file: string;
  label: string;
  family: string;
  defaults: { sampler: string; scheduler: string; steps: number; cfg: number; guidance?: number };
  hires: { scale: number; steps: number; denoise: number };
  qualityBlock: string;
  negativeBlock: string;
  safeNegative?: string;
  notes: string;
}
export interface Lora {
  file: string;
  label: string;
  base: "illustrious" | "flux";
  kind: "character" | "style" | "concept" | "detailer" | "slider";
  triggerWords: string[];
  weight: { default: number; min: number; max: number };
  civitai?: { modelId?: number; versionId?: number; sha256?: string };
}

const buckets: Record<Aspect, Size> = {
  portrait: { width: 832, height: 1216 },
  square: { width: 1024, height: 1024 },
  landscape: { width: 1216, height: 832 },
  wide: { width: 1344, height: 768 },
};
export const FAMILIES: Record<string, Family> = {
  "sdxl-illustrious": {
    id: "sdxl-illustrious", label: "SDXL · Illustrious", graph: "sdxl", loraBase: "illustrious",
    promptStyle: "tags", sizes: buckets, upscaler: "RealESRGAN_x4plus_anime_6B.safetensors",
  },
  "sdxl-noobai": { id: "sdxl-noobai", label: "SDXL · NoobAI", graph: "sdxl", loraBase: "illustrious", promptStyle: "tags", sizes: buckets, upscaler: "RealESRGAN_x4plus_anime_6B.safetensors" },
  "flux-dev": { id: "flux-dev", label: "FLUX.1 dev", graph: "flux", loraBase: "flux", promptStyle: "prose", sizes: buckets, upscaler: "RealESRGAN_x4plus.safetensors" },
};
export const WAI = "waiIllustriousSDXL_v170.safetensors";
export const JANKU = "JANKUTrainedChenkinNoobai_v777.safetensors";
export const FLUX = "flux1-dev-fp8.safetensors";
export const CHECKPOINTS: Checkpoint[] = [
  {
    file: WAI, label: "WAI-illustrious v17", family: "sdxl-illustrious",
    defaults: { sampler: "euler_ancestral", scheduler: "normal", steps: 28, cfg: 6 },
    hires: { scale: 1.5, steps: 20, denoise: 0.4 }, qualityBlock: "masterpiece, best quality, amazing quality",
    negativeBlock: "bad quality, worst quality, worst detail, sketch, censor", notes: "Anime, characters and action.",
  },
  {
    file: JANKU, label: "JANKU v7.77", family: "sdxl-noobai",
    defaults: { sampler: "euler_ancestral", scheduler: "simple", steps: 30, cfg: 4 },
    hires: { scale: 1.5, steps: 20, denoise: 0.4 }, qualityBlock: "embedding:lazypos",
    negativeBlock: "embedding:lazyneg, embedding:lazyhand", safeNegative: "nsfw, embedding:lazynsfw",
    notes: "Detailed portraits and faces.",
  },
  {
    file: FLUX, label: "FLUX.1 dev fp8", family: "flux-dev",
    defaults: { sampler: "euler", scheduler: "beta", steps: 25, cfg: 1, guidance: 3.5 },
    hires: { scale: 1.5, steps: 12, denoise: 0.3 }, qualityBlock: "", negativeBlock: "",
    notes: "Scenery, architecture and landscapes; prose prompt.",
  },
];

export const imageSize = (family: Family, aspect: Aspect, hires: Checkpoint["hires"] | null): Size => {
  const size = family.sizes[aspect];
  if (!hires) return size;
  const round8 = (value: number) => Math.round(value / 8) * 8;
  return { width: round8(size.width * hires.scale), height: round8(size.height * hires.scale) };
};

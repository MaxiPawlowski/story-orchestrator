export const ASPECTS = ["portrait", "square", "landscape", "wide"] as const;
export type Aspect = (typeof ASPECTS)[number];
export const SHOTS = ["close", "upper", "cowboy", "full", "wide", "pov", "from_above", "from_below"] as const;
export type Shot = (typeof SHOTS)[number];
export type Quality = "base" | "hires";
export type Purpose = "scene" | "character" | "portrait" | "user" | "background" | "free";
export type Placement = "inline" | "message" | "background";
export interface Size { width: number; height: number }
export interface Recipe {
  defaults: { sampler: string; scheduler: string; steps: number; cfg: number };
  hires: { scale: number; steps: number; denoise: number };
  qualityBlock: string;
  negativeBlock: string;
  safeNegative?: string;
  notes: string;
}
export interface Family {
  id: string;
  label: string;
  loraBase: "illustrious";
  sizes: Record<Aspect, Size>;
  recognise: RegExp;
  upscalerHint: RegExp;
  recipe: Recipe;
}
export interface Checkpoint extends Recipe {
  file: string;
  label: string;
  family: string;
}
export interface Lora {
  file: string;
  label: string;
  base: "illustrious";
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
    id: "sdxl-illustrious", label: "SDXL · Illustrious", loraBase: "illustrious", sizes: buckets,
    recognise: /illustrious|\bwai|ilxl|il[-_]xl/i, upscalerHint: /anime/i,
    recipe: {
      defaults: { sampler: "euler_ancestral", scheduler: "normal", steps: 28, cfg: 6 },
      hires: { scale: 1.5, steps: 20, denoise: 0.4 }, qualityBlock: "masterpiece, best quality, amazing quality",
      negativeBlock: "bad quality, worst quality, worst detail, sketch, censor", notes: "Anime, characters, action and scenery.",
    },
  },
  "sdxl-noobai": {
    id: "sdxl-noobai", label: "SDXL · NoobAI", loraBase: "illustrious", sizes: buckets,
    recognise: /noob/i, upscalerHint: /anime/i,
    recipe: {
      defaults: { sampler: "euler_ancestral", scheduler: "simple", steps: 30, cfg: 4 },
      hires: { scale: 1.5, steps: 20, denoise: 0.4 }, qualityBlock: "embedding:lazypos",
      negativeBlock: "embedding:lazyneg, embedding:lazyhand", safeNegative: "nsfw, embedding:lazynsfw",
      notes: "Detailed portraits and faces.",
    },
  },
};
export const FAMILY_IDS = Object.keys(FAMILIES);
export const DEFAULT_FAMILY = "sdxl-illustrious";

const RECOGNITION_ORDER = ["sdxl-noobai", "sdxl-illustrious"];

export const familyOf = (file: string): string | null => RECOGNITION_ORDER.find((id) => FAMILIES[id].recognise.test(file)) ?? null;

export const modelLabel = (file: string): string => file.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "");

export const checkpointFor = (file: string, familyId: string): Checkpoint => {
  const family = FAMILIES[familyId] ?? FAMILIES[DEFAULT_FAMILY];
  return { ...family.recipe, file, family: family.id, label: file ? modelLabel(file) : family.label };
};

export const modelId = (checkpoint: Checkpoint): string => checkpoint.file || checkpoint.family;

export type CheckpointResolution =
  | { ok: true; file: string; source: "mapped" | "discovered" }
  | { ok: false; problem: "missing" | "none" | "several"; family: string; mapped: string; found: string[] };

export const resolveCheckpointFile = (mapped: string, familyId: string, discovered: readonly string[]): CheckpointResolution => {
  if (mapped) return discovered.includes(mapped) ? { ok: true, file: mapped, source: "mapped" } : { ok: false, problem: "missing", family: familyId, mapped, found: [] };
  const found = discovered.filter((file) => familyOf(file) === familyId);
  if (found.length === 1) return { ok: true, file: found[0], source: "discovered" };
  return { ok: false, problem: found.length ? "several" : "none", family: familyId, mapped, found };
};

export const resolutionProblem = (where: string, resolution: Extract<CheckpointResolution, { ok: false }>): string => {
  const family = FAMILIES[resolution.family]?.label ?? resolution.family;
  if (resolution.problem === "missing") return `${where}: ${resolution.mapped} is not installed on this ComfyUI`;
  if (resolution.problem === "several") return `${where}: several ${family} models are installed (${resolution.found.join(", ")}), choose one`;
  return `${where}: no installed model is recognised as ${family}, choose one`;
};

export const resolveUpscaler = (mapped: string, family: Family, discovered: readonly string[]): string | null => {
  if (mapped) return discovered.includes(mapped) ? mapped : null;
  if (discovered.length === 1) return discovered[0];
  const hinted = discovered.filter((file) => family.upscalerHint.test(file));
  return hinted.length === 1 ? hinted[0] : null;
};

export const imageSize = (family: Family, aspect: Aspect, hires: Checkpoint["hires"] | null): Size => {
  const size = family.sizes[aspect];
  if (!hires) return size;
  const round8 = (value: number) => Math.round(value / 8) * 8;
  return { width: round8(size.width * hires.scale), height: round8(size.height * hires.scale) };
};

import type { ComfyDiscovery } from "@services/stHost/media";
import { publishSpriteRecipe, type SpriteRecipeHealth } from "@runtime/spriteRecipeHealth";
import { RENDER_PRESETS, type SceneRecipeSetting, type SpriteSettings } from "./settings";

export type RecipeStatus = "unchecked" | "ready" | "missing" | "unreachable";
export interface DefaultRecipe { status: RecipeStatus; source?: "install" | "discovered"; recipe: SceneRecipeSetting | null; problem: string | null }
export interface RecipeDeps {
  discover(): Promise<Pick<ComfyDiscovery, "diffusionModels" | "textEncoders" | "vaes">>;
  fingerprint(kind: "diffusionModels" | "textEncoders" | "vaes", name: string): Promise<unknown>;
}

const QWEN_EDIT = /qwen[\w.-]*image[\w.-]*2[._]?1/i;
const KINDS = [["diffusionModels", "Qwen Image 2.1 edit diffusion model"], ["textEncoders", "Qwen VL text encoder"], ["vaes", "Qwen Image VAE"]] as const;
const candidates = (discovery: Pick<ComfyDiscovery, "diffusionModels" | "textEncoders" | "vaes">) => ({
  diffusionModels: discovery.diffusionModels.filter((name) => QWEN_EDIT.test(name) && !/turbo|lightning/i.test(name)),
  textEncoders: discovery.textEncoders.filter((name) => /qwen/i.test(name)),
  vaes: discovery.vaes.filter((name) => /qwen/i.test(name)),
});

export function discoveredSceneRecipe(discovery: Pick<ComfyDiscovery, "diffusionModels" | "textEncoders" | "vaes">): SceneRecipeSetting | null {
  const found = candidates(discovery);
  return KINDS.every(([kind]) => found[kind].length === 1)
    ? { models: { diffusion: found.diffusionModels[0], encoder: found.textEncoders[0], vae: found.vaes[0] }, ...RENDER_PRESETS.standard } : null;
}

export function discoveryProblem(discovery: Pick<ComfyDiscovery, "diffusionModels" | "textEncoders" | "vaes">): string | null {
  const found = candidates(discovery);
  const gaps = KINDS.flatMap(([kind, label]) => (found[kind].length === 1 ? [] : found[kind].length
    ? [`more than one ${label} (${found[kind].join(", ")})`] : [`no ${label}`]));
  return gaps.length ? `ComfyUI offers ${gaps.join(", ")}. Install the missing files, or set sprites.sceneRecipe to choose one.` : null;
}

export async function resolveDefaultRecipe(settings: Pick<SpriteSettings, "sceneRecipe">, deps: RecipeDeps): Promise<DefaultRecipe> {
  let recipe = settings.sceneRecipe, source: DefaultRecipe["source"] = "install";
  if (!recipe) {
    let discovery: Awaited<ReturnType<RecipeDeps["discover"]>>;
    try { discovery = await deps.discover(); } catch (error) {
      return { status: "unreachable", recipe: null, problem: `ComfyUI did not list its models: ${error instanceof Error ? error.message : String(error)}` };
    }
    recipe = discoveredSceneRecipe(discovery);
    source = "discovered";
    if (!recipe) return { status: "missing", recipe: null, problem: discoveryProblem(discovery) };
  }
  const chosen = recipe;
  try {
    await Promise.all([deps.fingerprint("diffusionModels", chosen.models.diffusion), deps.fingerprint("textEncoders", chosen.models.encoder),
      deps.fingerprint("vaes", chosen.models.vae)]);
  } catch (error) {
    return { status: "missing", recipe: null, problem: `The Qwen route's model files could not be fingerprinted (${error instanceof Error ? error.message : String(error)}). `
      + "Add their folders to the media plugin's modelRoots." };
  }
  return { status: "ready", source, recipe: chosen, problem: null };
}

let current: DefaultRecipe = { status: "unchecked", recipe: null, problem: null };
export const defaultRecipe = (): DefaultRecipe => current;

export function setDefaultRecipe(next: DefaultRecipe, settings: Pick<SpriteSettings, "builders" | "visualSources">): void {
  current = next;
  publishSpriteRecipe(recipeHealth(next, settings));
}

export const recipeHealth = (recipe: DefaultRecipe, settings: Pick<SpriteSettings, "builders" | "visualSources">): SpriteRecipeHealth => ({
  status: recipe.status, problem: recipe.problem, source: recipe.source ?? null,
  waiting: Object.keys(settings.visualSources).filter((folder) => !settings.builders[folder]).sort(),
});

export function withDefaultBuilders(settings: SpriteSettings, recipe: SceneRecipeSetting | null = current.recipe): SpriteSettings {
  if (!recipe) return settings;
  const derived = Object.fromEntries(Object.entries(settings.visualSources).filter(([folder]) => !settings.builders[folder])
    .map(([folder, source]) => [folder, { baseSet: source.baseSet, box: { ...source.box }, models: { ...recipe.models }, steps: recipe.steps,
      ...(recipe.resolution ? { resolution: recipe.resolution } : {}) }]));
  return Object.keys(derived).length ? { ...settings, builders: { ...derived, ...settings.builders } } : settings;
}

export function builderGap(settings: Pick<SpriteSettings, "builders" | "visualSources">, folder: string, recipe: DefaultRecipe = current): string | null {
  if (settings.builders[folder]) return null;
  if (!settings.visualSources[folder]) {
    return "No accepted base and bust: prepare this character's presentation in Studio first; the install-wide Qwen route derives its crop box and base set from them.";
  }
  return recipe.problem ?? "The install-wide Qwen route is still being checked.";
}

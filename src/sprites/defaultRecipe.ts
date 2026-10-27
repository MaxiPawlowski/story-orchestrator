import type { ComfyDiscovery } from "@services/stHost/media";
import { publishSpriteRecipe, type SpriteRecipeHealth } from "@runtime/spriteRecipeHealth";
import { RENDER_PRESETS, type SceneRecipeSetting, type SpriteSettings } from "./settings";

export type RecipeStatus = "unchecked" | "ready" | "missing" | "unreachable";
export interface DefaultRecipe { status: RecipeStatus; source?: "install" | "discovered"; recipe: SceneRecipeSetting | null; problem: string | null }
export interface RecipeDeps {
  discover(): Promise<Pick<ComfyDiscovery, "diffusionModels" | "textEncoders" | "vaes">>;
  fingerprint(kind: "diffusionModels" | "textEncoders" | "vaes", name: string): Promise<unknown>;
}

type Discovery = Pick<ComfyDiscovery, "diffusionModels" | "textEncoders" | "vaes">;
type Kind = keyof Discovery;
const QWEN_21 = /qwen[\w.-]*image[\w.-]*2[._]?1/i;
const GENERATIONS: Array<{ id: string; kinds: Record<Kind, { label: string; match(name: string): boolean }> }> = [{
  id: "Qwen Image 2.1",
  kinds: {
    diffusionModels: { label: "Qwen Image 2.1 edit diffusion model", match: (name) => QWEN_21.test(name) && !/turbo|lightning/i.test(name) },
    textEncoders: { label: "Qwen3-VL text encoder (Qwen Image 2.1)", match: (name) => /qwen[\W_]*3[\W_]*vl/i.test(name) },
    vaes: { label: "Qwen Image 2.1 VAE", match: (name) => QWEN_21.test(name) },
  },
}];
const KINDS: Kind[] = ["diffusionModels", "textEncoders", "vaes"];
const PLURAL: Record<Kind, string> = { diffusionModels: "diffusion models", textEncoders: "text encoders", vaes: "VAEs" };
const trios = (discovery: Discovery) => GENERATIONS.map((generation) => ({ generation,
  found: Object.fromEntries(KINDS.map((kind) => [kind, discovery[kind].filter((name) => generation.kinds[kind].match(name))])) as Record<Kind, string[]> }));

export function discoveredSceneRecipe(discovery: Discovery): SceneRecipeSetting | null {
  const complete = trios(discovery).filter(({ found }) => KINDS.every((kind) => found[kind].length === 1));
  if (complete.length !== 1) return null;
  const { found } = complete[0];
  return { models: { diffusion: found.diffusionModels[0], encoder: found.textEncoders[0], vae: found.vaes[0] }, ...RENDER_PRESETS.standard };
}

export function discoveryProblem(discovery: Discovery): string | null {
  if (discoveredSceneRecipe(discovery)) return null;
  const gaps = trios(discovery).flatMap(({ found, generation }) => KINDS.flatMap((kind) => {
    const label = generation.kinds[kind].label, names = found[kind];
    if (names.length > 1) return [`more than one ${label} (${names.join(", ")})`];
    if (names.length) return [];
    const others = discovery[kind].filter((name) => /qwen/i.test(name));
    return [others.length ? `no ${label} (its other Qwen ${PLURAL[kind]}, ${others.join(", ")}, belong to another Qwen generation)` : `no ${label}`];
  }));
  return `ComfyUI offers ${gaps.join(", ")}. Install the missing files, or set sprites.sceneRecipe to choose one.`;
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
const checked = new Set<() => void>();
export const defaultRecipe = (): DefaultRecipe => current;
export const RECIPE_WAIT_MS = 60_000;

export function recipeChecked(waitMs = RECIPE_WAIT_MS, signal?: AbortSignal): Promise<DefaultRecipe> {
  if (current.status !== "unchecked" || signal?.aborted) return Promise.resolve(current);
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); checked.delete(done); signal?.removeEventListener("abort", done); resolve(current); };
    const timer = setTimeout(done, waitMs);
    checked.add(done);
    signal?.addEventListener("abort", done, { once: true });
  });
}

export function setDefaultRecipe(next: DefaultRecipe, settings: Pick<SpriteSettings, "builders" | "visualSources">): void {
  current = next;
  publishSpriteRecipe(recipeHealth(next, settings));
  if (next.status !== "unchecked") for (const done of [...checked]) done();
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

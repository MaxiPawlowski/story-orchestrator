import type { IllustrationPurpose, StoryV2, WorkflowMap } from "@engine/schema";

type WorkflowStory = Pick<StoryV2, "illustrations"> & { checkpointById?: Record<string, { effects?: { illustrations?: { workflows?: WorkflowMap } } } | undefined> };

export const WORKFLOW_DENIED_NODES: readonly string[] = Object.freeze([
  "ExecutePython", "PythonScript", "RunPython", "Exec", "Eval", "ShellCommand", "RunCommand", "SystemCommand",
  "LoadTextFile", "SaveTextFile", "ReadFile", "WriteFile", "LoadFile", "SaveFile", "FileReader", "FileWriter",
  "Load Text File", "Save Text File", "LoadImageFromPath", "LoadImageFromUrl", "LoadImageFromURL", "HttpRequest", "HTTP Request", "WebRequest",
]);
const DENIED_PATTERN = /python|execute(?:code|script|python)|^eval|shell|command|subprocess|https?|webhook|fromurl|file(?:path|reader|writer)|(?:load|save|read|write)\w*(?:text|file|path)/i;

export const isDeniedNode = (classType: string): boolean => WORKFLOW_DENIED_NODES.includes(classType) || DENIED_PATTERN.test(classType);

export function workflowsFor(story: WorkflowStory | null | undefined, visitedPath: readonly string[]): WorkflowMap {
  const map: WorkflowMap = { ...(story?.illustrations?.workflows ?? {}) };
  for (const id of visitedPath) Object.assign(map, story?.checkpointById?.[id]?.effects?.illustrations?.workflows ?? {});
  return map;
}

export const workflowFor = (story: WorkflowStory | null | undefined, visitedPath: readonly string[], purpose: IllustrationPurpose): string | null =>
  workflowsFor(story, visitedPath)[purpose] ?? null;

export const requiredWorkflows = (story: (WorkflowStory & { checkpoints?: Array<{ effects?: { illustrations?: { workflows?: WorkflowMap } } }> }) | null | undefined): string[] => {
  const names = new Set(Object.values(story?.illustrations?.workflows ?? {}));
  for (const checkpoint of story?.checkpoints ?? []) for (const name of Object.values(checkpoint.effects?.illustrations?.workflows ?? {})) names.add(name);
  return [...names].filter((name): name is string => typeof name === "string").sort();
};

export type WorkflowDecision = { use: string } | { fallback: string; mapped: string | null };

export function decideWorkflow({ mapped, source, listed, text }: { mapped: string | null; source: string | null; listed: readonly string[] | null; text: string | null }): WorkflowDecision {
  if (!mapped) return { fallback: "", mapped: null };
  if (source !== "comfy") return { fallback: `The story's workflow ${mapped} needs SillyTavern's ComfyUI source; your own image settings were used.`, mapped };
  if (!listed || !listed.includes(mapped)) return { fallback: `The story's workflow ${mapped} is not installed; your own workflow was used.`, mapped };
  if (text === null) return { fallback: `The story's workflow ${mapped} could not be read; your own workflow was used.`, mapped };
  if (!text.includes("\"%prompt%\"")) return { fallback: `The story's workflow ${mapped} has no "%prompt%" placeholder, so it would ignore the scene; your own workflow was used.`, mapped };
  return { use: mapped };
}

export interface GraphCheck { nodes: string[]; missingNodes: string[]; deniedNodes: string[]; hasPrompt: boolean; models: string[] }

const MODEL_INPUTS = ["ckpt_name", "unet_name", "lora_name", "vae_name", "clip_name", "clip_name1", "clip_name2", "model_name", "control_net_name", "upscale_model"];

export function checkWorkflowGraph(graph: Record<string, unknown>, available: readonly string[] | null): GraphCheck {
  const nodes = new Set<string>();
  const models = new Set<string>();
  for (const node of Object.values(graph)) {
    if (!node || typeof node !== "object") continue;
    const classType = (node as { class_type?: unknown }).class_type;
    if (typeof classType === "string") nodes.add(classType);
    const inputs = (node as { inputs?: unknown }).inputs;
    if (inputs && typeof inputs === "object") for (const key of MODEL_INPUTS) {
      const value = (inputs as Record<string, unknown>)[key];
      if (typeof value === "string" && /\.(?:safetensors|gguf|pt|pth|ckpt|bin|sft)$/i.test(value)) models.add(value);
    }
  }
  const list = [...nodes].sort();
  return {
    nodes: list,
    missingNodes: available ? list.filter((name) => !available.includes(name)) : [],
    deniedNodes: list.filter(isDeniedNode),
    hasPrompt: JSON.stringify(graph).includes("\"%prompt%\""),
    models: [...models].sort(),
  };
}

export const canonicalWorkflowText = (graph: Record<string, unknown>): string => JSON.stringify(graph, null, 2);

const sameGraph = (a: string, b: string): boolean => {
  try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch { return a === b; }
};

export type BundlePlan = { action: "present"; name: string } | { action: "install"; name: string; renamedFrom?: string };

export function planBundleInstall(name: string, text: string, listed: readonly string[], existing: (candidate: string) => string | null): BundlePlan {
  if (!listed.includes(name)) return { action: "install", name };
  const current = existing(name);
  if (current !== null && sameGraph(current, text)) return { action: "present", name };
  const stem = name.replace(/\.json$/i, "");
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${stem}-${index}.json`;
    if (!listed.includes(candidate)) return { action: "install", name: candidate, renamedFrom: name };
    const other = existing(candidate);
    if (other !== null && sameGraph(other, text)) return { action: "present", name: candidate };
  }
  throw new Error(`No free name for ${name}; rename one of your workflows first.`);
}

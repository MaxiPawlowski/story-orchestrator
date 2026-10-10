import type { StoryV2 } from "@engine/schema";
import { listComfyWorkflows, readComfyWorkflow, reconcileComfyWorkflowSwap, withComfyWorkflow } from "@services/stHost/comfyWorkflows";
import { renderStImage, stImageReadiness } from "@services/stHost/stImage";
import { log } from "@utils/log";
import type { ImageHealthView } from "@runtime/imageHealth";
import { checkWorkflowGraph, decideWorkflow, requiredWorkflows } from "./workflows";

export { reconcileComfyWorkflowSwap };
export { workflowFor } from "./workflows";

export async function renderWithStoryWorkflow(workflow: string, positive: string, negative: string): Promise<{ path: string; note: string | null }> {
  const ready = await stImageReadiness();
  const listed = ready.source === "comfy" ? await listComfyWorkflows() : null;
  const text = listed ? await readComfyWorkflow(workflow, listed) : null;
  const decision = decideWorkflow({ mapped: workflow, source: ready.source, listed, text });
  if ("fallback" in decision) {
    log.info("Story workflow not used", decision.fallback);
    return { path: await renderStImage(positive, negative), note: decision.fallback };
  }
  const outcome = await withComfyWorkflow(decision.use, () => renderStImage(positive, negative));
  return { path: outcome.value, note: outcome.note };
}

type HealthStory = Parameters<typeof requiredWorkflows>[0] & Pick<StoryV2, "illustrations">;

export async function storyWorkflowHealth(story: HealthStory | null, source: string | null, nodes: () => Promise<string[] | null>): Promise<ImageHealthView["storyWorkflows"]> {
  const wanted = requiredWorkflows(story);
  if (!wanted.length) return undefined;
  const listed = await listComfyWorkflows();
  const missing = source === "comfy" && listed ? wanted.filter((name) => !listed.includes(name)) : wanted;
  const bundle = story?.illustrations?.bundle ?? {};
  let missingNodes: string[] = [];
  if (Object.keys(bundle).length) {
    const available = await nodes();
    if (available) missingNodes = [...new Set(Object.values(bundle).flatMap((entry) => checkWorkflowGraph(entry.graph, available).missingNodes))].sort();
  }
  return { wanted, missing, missingNodes, comfySource: source === "comfy" };
}

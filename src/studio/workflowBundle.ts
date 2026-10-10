import type { BundledWorkflow, WorkflowMap } from "@engine/schema";
import { listComfyWorkflows, readComfyWorkflow, saveNewComfyWorkflow } from "@services/stHost/comfyWorkflows";
import { canonicalWorkflowText, checkWorkflowGraph, planBundleInstall, type GraphCheck } from "../image/workflows";

export const graphDigest = async (graph: Record<string, unknown>): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(graph));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export async function bundleMapped(names: readonly string[]): Promise<{ bundle: Record<string, BundledWorkflow>; skipped: string[] }> {
  const listed = await listComfyWorkflows();
  const bundle: Record<string, BundledWorkflow> = {};
  const skipped: string[] = [];
  for (const name of new Set(names)) {
    const text = await readComfyWorkflow(name, listed);
    let graph: unknown = null;
    try { graph = text ? JSON.parse(text) : null; } catch { graph = null; }
    if (!graph || typeof graph !== "object" || Array.isArray(graph)) { skipped.push(name); continue; }
    bundle[name] = { graph: graph as Record<string, unknown>, sha256: await graphDigest(graph as Record<string, unknown>) };
  }
  return { bundle, skipped };
}

export const mappedNames = (maps: Array<WorkflowMap | undefined>): string[] =>
  [...new Set(maps.flatMap((map) => Object.values(map ?? {})).filter((name): name is string => typeof name === "string"))].sort();

export type InstallOutcome = { ok: true; name: string; present: boolean; renamedFrom?: string } | { ok: false; reason: string; check?: GraphCheck };

export async function installBundled(name: string, entry: BundledWorkflow, nodes: readonly string[] | null): Promise<InstallOutcome> {
  if (await graphDigest(entry.graph) !== entry.sha256) return { ok: false, reason: `The bundled ${name} does not match its recorded hash; it was not installed.` };
  const check = checkWorkflowGraph(entry.graph, nodes);
  if (check.deniedNodes.length) return { ok: false, reason: `${name} uses nodes that can run code or read files (${check.deniedNodes.join(", ")}); it is never installed from a story.`, check };
  if (!check.hasPrompt) return { ok: false, reason: `${name} has no "%prompt%" placeholder, so it would ignore the scene.`, check };
  const listed = await listComfyWorkflows();
  if (!listed) return { ok: false, reason: "SillyTavern's workflow list could not be read; nothing was written." };
  const texts = new Map<string, string | null>();
  for (const candidate of listed) if (candidate === name || candidate.startsWith(name.replace(/\.json$/i, "-"))) texts.set(candidate, await readComfyWorkflow(candidate, listed));
  const plan = planBundleInstall(name, canonicalWorkflowText(entry.graph), listed, (candidate) => texts.get(candidate) ?? null);
  if (plan.action === "present") return { ok: true, name: plan.name, present: true };
  const saved = await saveNewComfyWorkflow(plan.name, canonicalWorkflowText(entry.graph));
  if (!saved.ok) return { ok: false, reason: saved.reason, check };
  return { ok: true, name: plan.name, present: false, ...(plan.renamedFrom ? { renamedFrom: plan.renamedFrom } : {}) };
}

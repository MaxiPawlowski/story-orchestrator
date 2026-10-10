import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";

const BASE = "/api/sd/comfy";
const LEDGER_KEY = "story-orchestrator:comfy-workflow-swap";

const post = (route: string, body: Record<string, unknown>): Promise<Response> =>
  fetch(`${BASE}/${route}`, { method: "POST", headers: getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const sdSettings = (): Record<string, unknown> | null => {
  const sd = getContext().extensionSettings?.sd;
  return isRecord(sd) ? sd : null;
};

export const selectedComfyWorkflow = (): string | null => {
  const name = sdSettings()?.comfy_workflow;
  return typeof name === "string" && name ? name : null;
};

export async function listComfyWorkflows(): Promise<string[] | null> {
  try {
    const response = await post("workflows", { url: sdSettings()?.comfy_url ?? "" });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return Array.isArray(data) ? data.filter((name): name is string => typeof name === "string") : null;
  } catch { return null; }
}

export async function readComfyWorkflow(name: string, listed?: readonly string[] | null): Promise<string | null> {
  const names = listed ?? await listComfyWorkflows();
  if (!names?.includes(name)) return null;
  try {
    const response = await post("workflow", { file_name: name });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return typeof data === "string" ? data : null;
  } catch { return null; }
}

export async function saveNewComfyWorkflow(name: string, text: string): Promise<WriteResult<{ name: string }>> {
  const listed = await listComfyWorkflows();
  if (!listed) return couldNot("SillyTavern's workflow list could not be read; nothing was written.");
  if (listed.includes(name)) return couldNot(`A workflow named ${name} already exists; it is never overwritten.`);
  try {
    const response = await post("save-workflow", { file_name: name, workflow: text });
    if (!response.ok) return couldNot(`SillyTavern refused to save ${name} (${response.status}).`);
  } catch { return couldNot(`SillyTavern did not answer while saving ${name}.`); }
  const after = await listComfyWorkflows();
  return after?.includes(name) ? wrote({ name }) : couldNot(`${name} was not in the workflow list after saving.`);
}

interface SwapRow { previous: string | null; mapped: string; at: number }

const storage = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const writeRow = (row: SwapRow | null) => {
  try { const store = storage(); if (!store) return; if (row) store.setItem(LEDGER_KEY, JSON.stringify(row)); else store.removeItem(LEDGER_KEY); } catch { return; }
};
const readRow = (): SwapRow | null => {
  try {
    const raw = storage()?.getItem(LEDGER_KEY);
    const row: unknown = raw ? JSON.parse(raw) : null;
    const valid = isRecord(row) && typeof row.mapped === "string" && (row.previous === null || typeof row.previous === "string");
    return valid ? { previous: row.previous as string | null, mapped: row.mapped as string, at: Number(row.at) } : null;
  } catch { return null; }
};

export interface SwapOutcome<T> { value: T; restored: boolean; note: string | null }

export async function withComfyWorkflow<T>(name: string, run: () => Promise<T>): Promise<SwapOutcome<T>> {
  const sd = sdSettings();
  if (!sd) throw new Error("SillyTavern's Image Generation settings are not loaded.");
  const previous = selectedComfyWorkflow();
  if (previous === name) return { value: await run(), restored: true, note: null };
  writeRow({ previous, mapped: name, at: Date.now() });
  sd.comfy_workflow = name;
  try {
    return { value: await run(), ...restore(sd, previous, name) };
  } catch (error) {
    restore(sd, previous, name);
    throw error;
  }
}

const restore = (sd: Record<string, unknown>, previous: string | null, mapped: string): { restored: boolean; note: string | null } => {
  writeRow(null);
  if (sd.comfy_workflow !== mapped) {
    const note = `Your ComfyUI workflow changed to ${String(sd.comfy_workflow)} during a story picture; it was left as you set it.`;
    log.info(note);
    return { restored: false, note };
  }
  if (previous === null) delete sd.comfy_workflow; else sd.comfy_workflow = previous;
  return { restored: true, note: null };
};

export function reconcileComfyWorkflowSwap(): { restored: boolean; note: string | null } {
  const row = readRow();
  if (!row) return { restored: false, note: null };
  const sd = sdSettings();
  writeRow(null);
  if (!sd || sd.comfy_workflow !== row.mapped) return { restored: false, note: null };
  if (row.previous === null) delete sd.comfy_workflow; else sd.comfy_workflow = row.previous;
  getContext().saveSettingsDebounced?.();
  return { restored: true, note: `A story picture was interrupted; your ComfyUI workflow ${row.previous ?? "default"} was put back.` };
}

import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { randomId } from "@utils/uuid";

const ROOT = "/api/plugins/story-orchestrator-media/loops";
const headers = () => getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" };

export interface SavedLoop { url: string; bytes: number; sha256: string }
export interface LoopRenderMeta { model: string; promptVersion: number; ms?: number }

async function call(route: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${ROOT}${route}`, { headers: headers(), signal, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Install the media plugin and restart SillyTavern to animate backdrops.");
  return data;
}

const savedLoop = (data: unknown): SavedLoop | null =>
  isRecord(data) && typeof data.url === "string" && data.url.startsWith("/user/images/") && typeof data.bytes === "number" && typeof data.sha256 === "string"
    ? { url: data.url, bytes: data.bytes, sha256: data.sha256 } : null;

export async function cachedBackdropLoop(key: string, signal?: AbortSignal): Promise<SavedLoop | null> {
  return savedLoop(await call(`/cached/${encodeURIComponent(key)}`, undefined, signal));
}

export async function comfyLoopQueue(signal?: AbortSignal): Promise<{ running: number; pending: number } | null> {
  const data = await call("/queue", undefined, signal);
  return isRecord(data) && typeof data.running === "number" && typeof data.pending === "number" ? { running: data.running, pending: data.pending } : null;
}

export async function renderBackdropLoop(key: string, graph: Record<string, unknown>, meta: LoopRenderMeta, signal: AbortSignal, poll = 2000): Promise<WriteResult<SavedLoop>> {
  const id = randomId();
  const cancel = () => { void call(`/jobs/${id}/cancel`, {}).catch(() => {}); };
  signal.throwIfAborted();
  signal.addEventListener("abort", cancel, { once: true });
  const started = Date.now();
  try {
    let job = await call("/jobs", { id, key, graph }, signal);
    while (!signal.aborted) {
      if (!isRecord(job) || typeof job.status !== "string") return couldNot("The loop job has no status.");
      if (job.status === "complete") break;
      if (job.status === "failed" || job.status === "cancelled") return couldNot(typeof job.error === "string" ? job.error : "The loop was cancelled.");
      await new Promise<void>((resolve) => setTimeout(resolve, poll));
      job = await call(`/jobs/${id}`, undefined, signal);
    }
    signal.throwIfAborted();
    const saved = savedLoop(await call(`/jobs/${id}/save`, { key, meta: { ...meta, ms: Date.now() - started } }, signal));
    return saved ? wrote(saved) : couldNot("The loop video was not saved.");
  } finally { signal.removeEventListener("abort", cancel); }
}

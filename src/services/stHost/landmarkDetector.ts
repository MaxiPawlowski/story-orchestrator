import { getContext } from "./context";
import { isRecord } from "@utils/guards";

const ROUTE = "/api/plugins/story-orchestrator-media/landmarks";

export type LandmarkDetectorReply = { ok: true; result: unknown } | { ok: false; reason: string };

export async function detectFaceLandmarks(png: string, signal: AbortSignal): Promise<LandmarkDetectorReply> {
  let response: Response;
  try {
    response = await fetch(ROUTE, { method: "POST", headers: getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" }, body: JSON.stringify({ png }), signal });
  } catch {
    signal.throwIfAborted();
    return { ok: false, reason: "unavailable" };
  }
  if (response.status === 404) return { ok: false, reason: "unavailable" };
  const data: unknown = await response.json().catch(() => null);
  if (!isRecord(data)) return { ok: false, reason: "unavailable" };
  if (data.ok !== true) return { ok: false, reason: typeof data.reason === "string" ? data.reason : typeof data.error === "string" ? data.error : "unavailable" };
  return { ok: true, result: data };
}

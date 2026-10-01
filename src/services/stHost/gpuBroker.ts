import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";

const URL = "/api/plugins/story-orchestrator-gpu";

const post = async (route: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> =>
  fetch(`${URL}/${route}`, {
    method: "POST", headers: getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal,
  });

/** A grant from the broker, or `brokered: false` when the plugin is not installed: a missing broker
 *  must leave the image path open (no model switching) rather than block every render. */
export interface GpuReservation { lease: string | null; brokered: boolean }

export async function reserveGpu(signal?: AbortSignal): Promise<GpuReservation> {
  let response: Response;
  try {
    response = await post("lease", {}, signal);
  } catch (error) {
    log.warn("GPU broker connection failed", error);
    throw new Error("The GPU broker could not be reached. The image was not rendered.");
  }
  if (response.status === 404 || response.status === 501) return { lease: null, brokered: false };
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "The local GPU broker refused the image lease.");
  if (!isRecord(data) || typeof data.lease !== "string" || !data.lease) throw new Error("The GPU broker did not grant an image lease.");
  return { lease: data.lease, brokered: true };
}

export async function releaseGpu(lease: string | null): Promise<WriteResult<{ released: boolean }>> {
  if (!lease) return wrote({ released: false });
  const response = await post("release", { lease });
  const data: unknown = await response.json().catch(() => null);
  return response.ok && isRecord(data) && data.released === true ? wrote({ released: true }) : couldNot("The GPU broker did not release the image lease.");
}


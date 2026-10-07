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

/** What a render needs, so a managed controller can size the text residency before the image loads:
 *  the models used, the base render size and whether a hires pass follows. The controller estimates
 *  from these when no measured footprint exists yet. */
export interface GpuRequest {
  workflowKey?: string;
  modelFiles?: Array<{ kind: string; name: string }>;
  width?: number;
  height?: number;
  hires?: boolean;
  signal?: AbortSignal;
}

export interface GpuBrokerStatus { adapter: "none" | "unsloth" | "managed"; guarding: boolean; activeText?: number; waitingText?: number;
  gpuFreeMiB?: number; ramAvailableMiB?: number }

export async function gpuBrokerStatus(): Promise<GpuBrokerStatus | null> {
  let response: Response;
  try {
    response = await fetch(`${URL}/status`, { headers: getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" } });
  } catch { return null; }
  if (!response.ok) return null;
  const data: unknown = await response.json().catch(() => null);
  if (!isRecord(data) || typeof data.adapter !== "string" || !["none", "unsloth", "managed"].includes(data.adapter)) return null;
  const telemetry = isRecord(data.telemetry) ? data.telemetry : {};
  const host = isRecord(telemetry.host) ? telemetry.host : {};
  const gpu = Array.isArray(telemetry.gpus) && isRecord(telemetry.gpus[0]) ? telemetry.gpus[0] : {};
  return { adapter: data.adapter as GpuBrokerStatus["adapter"], guarding: data.guarding === true,
    ...(typeof data.activeText === "number" ? { activeText: data.activeText } : {}),
    ...(typeof data.waitingText === "number" ? { waitingText: data.waitingText } : {}),
    ...(typeof gpu.freeMiB === "number" ? { gpuFreeMiB: gpu.freeMiB } : {}),
    ...(typeof host.availableMiB === "number" ? { ramAvailableMiB: host.availableMiB } : {}) };
}

export async function reserveGpu(request: GpuRequest = {}): Promise<GpuReservation> {
  let response: Response;
  try {
    response = await post("lease", { workflowKey: request.workflowKey, modelFiles: request.modelFiles,
      width: request.width, height: request.height, hires: request.hires }, request.signal);
  } catch (error) {
    log.warn("GPU broker connection failed", error);
    throw new Error("The GPU broker could not be reached. The image was not rendered.");
  }
  if (response.status === 404 || response.status === 501) return { lease: null, brokered: false };
  const data: unknown = await response.json().catch(() => null);
  if (response.ok && isRecord(data) && data.brokered === false && data.lease === null) return { lease: null, brokered: false };
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

export async function renewGpu(lease: string | null): Promise<WriteResult<{ renewed: boolean }>> {
  if (!lease) return wrote({ renewed: false });
  const response = await post("renew", { lease });
  const data: unknown = await response.json().catch(() => null);
  return response.ok && isRecord(data) && data.renewed === true ? wrote({ renewed: true }) : couldNot("The GPU broker lease expired. Stop this batch and check the broker.");
}


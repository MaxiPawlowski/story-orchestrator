import { comfyDiscover, type ComfyDiscovery } from "@services/stHost/media";
import { releaseGpu, reserveGpu } from "@services/stHost/gpuBroker";
import { hostGenerating, leaseOutsideTurns } from "./textPriority";
import { log } from "@utils/log";

export interface ComfyWakeDeps {
  discover(signal: AbortSignal): Promise<ComfyDiscovery>;
  wake(signal: AbortSignal): Promise<{ brokered: boolean; release(): Promise<void> }>;
}

const reason = (error: unknown) => error instanceof Error ? error.message : String(error);
export const START_COMFY_HINT = "Start it from the tray or with node scripts/local/cli.mjs start-comfy.";

export async function discoverAwake(deps: ComfyWakeDeps, signal: AbortSignal): Promise<ComfyDiscovery> {
  try { return await deps.discover(signal); } catch (first) {
    signal.throwIfAborted();
    let held: Awaited<ReturnType<ComfyWakeDeps["wake"]>>;
    try { held = await deps.wake(signal); } catch (error) {
      signal.throwIfAborted();
      throw new Error(`ComfyUI did not answer (${reason(first)}), and the GPU controller could not start it (${reason(error)}). ${START_COMFY_HINT}`);
    }
    try { return await deps.discover(signal); } catch (error) {
      signal.throwIfAborted();
      throw new Error(held.brokered
        ? `ComfyUI did not answer (${reason(first)}), and still did not answer after the GPU controller was asked to start it (${reason(error)}). ${START_COMFY_HINT}`
        : `ComfyUI did not answer (${reason(error)}), and the GPU broker let the request through without starting it `
          + `(no supervising controller, or its start failed; the broker log says which). ${START_COMFY_HINT}`);
    } finally { await held.release(); }
  }
}

export const leaseWake = async (signal: AbortSignal): Promise<{ brokered: boolean; release(): Promise<void> }> => {
  const held = await leaseOutsideTurns({ acquire: () => reserveGpu({ signal, workflowKey: "comfy-discovery" }),
    release: async (lease) => { if (lease.lease) await releaseGpu(lease.lease); }, loud: hostGenerating,
    sleep: () => new Promise((resolve) => setTimeout(resolve, 500)), signal });
  return { brokered: held.brokered, release: async () => {
    const released = await releaseGpu(held.lease).catch((error: unknown) => ({ ok: false as const, reason: reason(error) }));
    if (!released.ok) log.warn(released.reason);
  } };
};

export const discoverWaking = (signal: AbortSignal): Promise<ComfyDiscovery> => discoverAwake({ discover: comfyDiscover, wake: leaseWake }, signal);

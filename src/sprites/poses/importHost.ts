import { beginRun, type RunOwnership } from "@runtime/runToken";
import { comfyDiscover, comfyFingerprint, comfyReference, comfyReleaseReference, comfyRenderOwned } from "@services/stHost/media";
import { reserveGpu, releaseGpu, renewGpu, gpuBrokerStatus, type GpuReservation } from "@services/stHost/gpuBroker";
import { waitForTextPriority } from "../builder/textPriority";
import { DWPOSE_FILES, dwposeGraph, readDWPose } from "./import";

export async function importPoseImage(image: string, ownership: RunOwnership) {
  const run = beginRun(ownership);
  let reference: string | null = null, reservation: GpuReservation | null = null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  run.signal.addEventListener("abort", abort, { once: true });
  let renewal: ReturnType<typeof setInterval> | undefined;
  const guard = () => { run.signal.throwIfAborted(); if (!run.stillOwns()) throw new Error("This pose import no longer belongs to the open story."); };
  try {
    const discovery = await comfyDiscover(run.signal);
    guard();
    if (!discovery.nodes.DWPreprocessor) throw new Error("Install comfyui_controlnet_aux and the approved DWPose files first. No download was started.");
    for (const name of DWPOSE_FILES) { await comfyFingerprint("poseModels", name, run.signal); guard(); }
    await waitForTextPriority({ signal: run.signal, current: run.stillOwns, status: gpuBrokerStatus, now: Date.now, sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) });
    guard();
    reservation = await reserveGpu({ workflowKey: "dwpose-import-v1", modelFiles: DWPOSE_FILES.map((name) => ({ kind: "poseModels", name })), width: 1024, height: 1024, signal: run.signal });
    guard();
    const lease = reservation.lease;
    if (lease) renewal = setInterval(() => { void renewGpu(lease).then((result) => { if (!result.ok) controller.abort(); }, () => controller.abort()); }, 20_000);
    reference = await comfyReference(image, run.signal);
    guard();
    const result = await comfyRenderOwned(dwposeGraph(reference), controller.signal);
    guard();
    return readDWPose(result.pose);
  } finally {
    if (renewal) clearInterval(renewal);
    run.signal.removeEventListener("abort", abort);
    try { if (reference) await comfyReleaseReference(reference); }
    finally { try { if (reservation) await releaseGpu(reservation.lease); } finally { run.release(); } }
  }
}

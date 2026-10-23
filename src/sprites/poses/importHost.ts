import { beginRun, type RunOwnership } from "@runtime/runToken";
import { comfyDiscover, comfyFingerprint, comfyReference, comfyReleaseReference, comfyRenderOwned } from "@services/stHost/media";
import { reserveGpu, releaseGpu, renewGpu, gpuBrokerStatus, type GpuReservation } from "@services/stHost/gpuBroker";
import { hostGenerating, waitForTextPriority } from "../builder/textPriority";
import { DWPOSE_FILES, dwposeGraph, readDWPose } from "./import";
import { anySignal } from "@utils/signals";

export async function importPoseImage(image: string, ownership: RunOwnership, signal?: AbortSignal) {
  const run = beginRun(ownership);
  let reference: string | null = null, reservation: GpuReservation | null = null;
  const controller = new AbortController();
  const active = anySignal([run.signal, controller.signal, ...(signal ? [signal] : [])]);
  let renewal: ReturnType<typeof setInterval> | undefined;
  const guard = () => { active.throwIfAborted(); if (!run.stillOwns()) throw new Error("This pose import no longer belongs to the open story."); };
  try {
    const discovery = await comfyDiscover(active);
    guard();
    if (!discovery.nodes.DWPreprocessor) throw new Error("Install comfyui_controlnet_aux and the approved DWPose files first. No download was started.");
    for (const name of DWPOSE_FILES) { await comfyFingerprint("poseModels", name, active); guard(); }
    await waitForTextPriority({ signal: active, current: run.stillOwns, status: gpuBrokerStatus, loud: hostGenerating, now: Date.now,
      sleep: () => new Promise((resolve) => setTimeout(resolve, 500)) });
    guard();
    reservation = await reserveGpu({ workflowKey: "dwpose-import-v1", modelFiles: DWPOSE_FILES.map((name) => ({ kind: "poseModels", name })), width: 1024, height: 1024, signal: active });
    guard();
    const lease = reservation.lease;
    if (lease) renewal = setInterval(() => { void renewGpu(lease).then((result) => { if (!result.ok) controller.abort(); }, () => controller.abort()); }, 20_000);
    reference = await comfyReference(image.replace(/^data:image\/png;base64,/, ""), active);
    guard();
    const result = await comfyRenderOwned(dwposeGraph(reference), active);
    guard();
    return readDWPose(result.pose);
  } finally {
    if (renewal) clearInterval(renewal);
    try { if (reference) await comfyReleaseReference(reference); }
    finally { try { if (reservation) await releaseGpu(reservation.lease); } finally { run.release(); } }
  }
}

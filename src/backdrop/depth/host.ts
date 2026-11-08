import { getGlobalSettings } from "@runtime/settingsStore";
import { comfyReference, comfyReleaseReference, comfyRenderOwned, mediaStatus } from "@services/stHost/media";
import { imageSave } from "@services/stHost/image";
import { gpuBrokerStatus, releaseGpu, renewGpu, reserveGpu } from "@services/stHost/gpuBroker";
import { sha256Hex } from "@utils/sha256";
import { abortableSleep } from "@utils/leaseWait";
import { log } from "@utils/log";
import { ImageQueue } from "../../image/queue";
import { depthGraph } from "./graph";
import { hostGenerating, leaseOutsideTurns, waitForTextPriority } from "../../sprites/builder/textPriority";
import { DepthCache, type DepthDeps } from "./cache";
import { DEPTH_FOLDER, DEPTH_MODEL, uploadSize } from "./key";
import { sceneMask } from "./mask";

const MAX_BYTES = 32 * 1024 * 1024;
let fallbackQueue: ImageQueue | null = null;

const sameOrigin = (source: string): string => {
  const resolved = new URL(source, location.href);
  if (resolved.origin !== location.origin) throw new Error("Depth is made only for backgrounds this SillyTavern serves.");
  return resolved.href;
};

async function readBytes(source: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(sameOrigin(source), { signal });
  if (!response.ok) throw new Error(`The background could not be read (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("The background is too large for a depth map.");
  return bytes;
}

async function loadBitmap(source: string, signal: AbortSignal): Promise<ImageBitmap> {
  const bytes = await readBytes(source, signal);
  return createImageBitmap(new Blob([bytes]));
}

async function uploadPng(source: string, signal: AbortSignal): Promise<{ data: string; width: number; height: number }> {
  const bitmap = await loadBitmap(source, signal);
  try {
    const size = uploadSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the background for depth.");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return { data: canvas.toDataURL("image/png").split(",")[1], ...size };
  } finally { bitmap.close(); }
}

async function produce(source: string, key: string, signal: AbortSignal): Promise<string> {
  const png = await uploadPng(source, signal);
  await waitForTextPriority({ status: gpuBrokerStatus, loud: hostGenerating, current: () => true, signal, now: Date.now, sleep: () => abortableSleep(1_000, signal) });
  const lease = await leaseOutsideTurns({
    acquire: () => reserveGpu({ workflowKey: `backdrop-depth-${DEPTH_MODEL.id}`, width: png.width, height: png.height, signal, foreground: false }),
    release: async (held) => { await releaseGpu(held.lease); }, loud: hostGenerating, sleep: () => abortableSleep(1_000, signal), signal,
  });
  const heartbeat = setInterval(() => { void renewGpu(lease.lease); }, 60_000);
  let reference: string | null = null;
  try {
    reference = await comfyReference(png.data, signal, { character: "backdrop", set: "depth" });
    const result = await comfyRenderOwned(depthGraph(reference), signal);
    signal.throwIfAborted();
    return await imageSave(result.data, result.format, DEPTH_FOLDER, key);
  } finally {
    clearInterval(heartbeat);
    try { if (reference) await comfyReleaseReference(reference); }
    finally { await releaseGpu(lease.lease); }
  }
}

async function mask(depthUrl: string, source: string, signal: AbortSignal): Promise<string | null> {
  const [depth, base] = await Promise.all([loadBitmap(depthUrl, signal), loadBitmap(source, signal).catch(() => null)]);
  try {
    const width = depth.width, height = depth.height;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    let color: Uint8ClampedArray | null = null;
    if (base) { context.drawImage(base, 0, 0, width, height); color = context.getImageData(0, 0, width, height).data; }
    context.clearRect(0, 0, width, height);
    context.drawImage(depth, 0, 0);
    const pixels = sceneMask(context.getImageData(0, 0, width, height).data, color, width, height);
    if (!pixels) return null;
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? URL.createObjectURL(blob) : null;
  } finally { depth.close(); base?.close(); }
}

export const depthDeps = (): DepthDeps => ({
  identify: async (source, signal) => ({ sha256: await sha256Hex(await readBytes(source, signal)) }),
  exists: async (path, signal) => {
    const response = await fetch(`/${path}`, { method: "HEAD", signal, cache: "no-store" });
    return response.ok;
  },
  canProduce: async () => getGlobalSettings().image.enabled && (await mediaStatus()) !== null,
  enqueue: (label, run) => (globalThis.storyOrchestratorImage?.queue ?? (fallbackQueue ??= new ImageQueue())).enqueue(label, run),
  produce,
  mask,
  now: Date.now,
  log: (message) => log.info(message),
});

let shared: DepthCache | null = null;
export const depthCache = (): DepthCache => (shared ??= new DepthCache(depthDeps()));

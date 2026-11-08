import { notifyAssetsChanged, onBaseShown, registerAssetProvider, shownBase } from "../assets";
import { registerLayer } from "../stage/registry";
import type { BackdropBase } from "../types";
import { cinemagraphAuto, cinemagraphLayer, CINEMAGRAPH_KIND } from "./cinemagraph";
import { cachedBackdropLoop, comfyLoopQueue, LOOP_INTERRUPTED, renderBackdropLoop } from "@services/stHost/backdropLoops";
import { comfyDiscover, comfyReference, comfyReleaseReference, mediaStatus } from "@services/stHost/media";
import { gpuBrokerStatus, releaseGpu, renewGpu, reserveGpu } from "@services/stHost/gpuBroker";
import { busyWork } from "@runtime/busy";
import { log } from "@utils/log";
import { sha256Hex } from "@utils/sha256";
import { couldNot } from "@utils/writeResult";
import { loopKey, loopSeed } from "./key";
import { backgroundNameOf, currentTarget, preTargets, type LoopStory, type LoopTarget } from "./plan";
import { loopPrompt } from "./prompt";
import { LoopScheduler, type ResolvedLoop } from "./scheduler";
import { buildLoopGraph, fitShape, LOOP_MODEL, LOOP_PROMPT_VERSION, LOOP_SHAPES, loopModelFiles, type LoopShape, type LoopTier, type VideoTier } from "./workflow";

export const LOOP_QUIET_MS = 20_000;
export const LOOP_NEED_GPU_MIB = 18_000;
export const LOOP_NEED_RAM_MIB = 18_000;
const STILL_MAX_EDGE = 1280;
const GPU_KINDS = new Set(["image", "sprite"]);
const gpuWork = (chatId: string | null): boolean => busyWork.view(chatId).some((job) => GPU_KINDS.has(job.kind));

export interface LoopHostInput {
  story(): LoopStory | null;
  checkpointId(): string | null;
  chatId(): string | null;
  tier(): LoopTier;
  hostGenerating(): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

async function stillPng(bytes: ArrayBuffer, signal: AbortSignal): Promise<string> {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  signal.throwIfAborted();
  const scale = Math.min(1, STILL_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(32, Math.round(bitmap.width * scale));
  canvas.height = Math.max(32, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

export async function gpuIdle(input: Pick<LoopHostInput, "hostGenerating" | "chatId">): Promise<boolean> {
  if (await input.hostGenerating()) return false;
  if (gpuWork(input.chatId())) return false;
  const broker = await gpuBrokerStatus();
  if (broker && (broker.activeText || broker.waitingText || broker.state === "image" || broker.state === "waiting")) return false;
  const queue = await comfyLoopQueue().catch(() => null);
  return queue !== null && queue.running + queue.pending === 0;
}

export const isVideoTier = (tier: LoopTier): tier is VideoTier => tier === "lite" || tier === "full";

export async function loopModelsInstalled(): Promise<boolean | null> {
  if (!(await mediaStatus())) return false;
  const found = await comfyDiscover().catch(() => null);
  if (!found) return null;
  return found.diffusionModels.includes(LOOP_MODEL.diffusion) && found.textEncoders.includes(LOOP_MODEL.encoder) && found.vaes.includes(LOOP_MODEL.vae);
}

export const effectiveTier = (wanted: LoopTier, installed: boolean | null): LoopTier =>
  isVideoTier(wanted) && installed === false ? "cinemagraph" : wanted;

interface StillKey { key: string; bytes: ArrayBuffer; shape: LoopShape; tier: VideoTier }

export function startBackdropLoops(input: LoopHostInput): () => void {
  const published = new Map<string, string>();
  const keys = new Map<string, Promise<StillKey | null>>();
  let quietSince = Date.now();
  let installed: boolean | null = null;
  const tier = (): LoopTier => effectiveTier(input.tier(), installed);
  const videoTier = (): VideoTier | null => { const value = tier(); return isVideoTier(value) ? value : null; };

  const stillKey = (still: string, wanted: VideoTier): Promise<StillKey | null> => {
    const id = `${wanted}|${still}`;
    const known = keys.get(id);
    if (known) return known;
    const next = (async () => {
      const response = await fetch(still, { cache: "no-store" });
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const shape = fitShape(LOOP_SHAPES[wanted], bitmap.width, bitmap.height);
      bitmap.close();
      return { key: await loopKey(await sha256Hex(bytes), loopPrompt(backgroundNameOf(still)), shape), bytes, shape, tier: wanted };
    })().catch(() => null);
    keys.set(id, next);
    return next;
  };

  const render = async (loop: ResolvedLoop, signal: AbortSignal) => {
    const wanted = videoTier();
    const still = wanted ? await stillKey(loop.target.still, wanted) : null;
    if (!still || still.key !== loop.key) return couldNot("The background or the loop tier changed.");
    const reference = await comfyReference(await stillPng(still.bytes, signal), signal, { character: "backdrop", set: "loops" });
    try {
      const reservation = await reserveGpu({ signal, width: still.shape.width, height: still.shape.height, needGpuMiB: LOOP_NEED_GPU_MIB, needRamMiB: LOOP_NEED_RAM_MIB,
        workflowKey: JSON.stringify({ recipe: "backdrop-loop", model: LOOP_MODEL.id, tier: still.tier, frames: still.shape.frames }), modelFiles: loopModelFiles() });
      const renew = reservation.lease ? setInterval(() => { void renewGpu(reservation.lease).catch(() => undefined); }, 30_000) : null;
      try {
        const graph = buildLoopGraph({ image: reference, prompt: loopPrompt(backgroundNameOf(loop.target.still)), key: loop.key, seed: loopSeed(loop.key), shape: still.shape });
        return await renderBackdropLoop(loop.key, graph, { model: LOOP_MODEL.id, promptVersion: LOOP_PROMPT_VERSION, tier: still.tier }, signal);
      } finally {
        if (renew) clearInterval(renew);
        const released = await releaseGpu(reservation.lease);
        if (!released.ok) log.warn(released.reason);
      }
    } finally {
      const released = await comfyReleaseReference(reference);
      if (!released.ok) log.warn(released.reason);
    }
  };

  const scheduler = new LoopScheduler({
    enabled: () => videoTier() !== null,
    idle: async () => {
      if (!(await gpuIdle(input))) { quietSince = Date.now(); return false; }
      return Date.now() - quietSince >= LOOP_QUIET_MS;
    },
    resolve: async (target) => {
      const wanted = videoTier();
      const still = wanted ? await stillKey(target.still, wanted) : null;
      return still ? { key: still.key, target } : null;
    },
    cached: async (key, signal) => published.get(key) ?? (await cachedBackdropLoop(key, signal))?.url ?? null,
    render,
    retryable: (reason) => reason === LOOP_INTERRUPTED,
    publish: (target, url) => {
      const wanted = videoTier();
      if (!wanted) return;
      void stillKey(target.still, wanted).then((still) => {
        if (!still) return;
        published.set(still.key, url);
        const base = shownBase();
        if (base?.url === target.still) notifyAssetsChanged(base.key);
      });
    },
    wait: (ms, signal) => new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    }),
    log: (event, detail) => log.info(`Backdrop loop ${event}`, detail),
  });

  const current = (base: BackdropBase | null): LoopTarget | null =>
    base && base.kind === "image" ? currentTarget(input.story(), input.checkpointId(), base.url) : null;

  let story = input.story();
  let chat = input.chatId();
  let lastTier = tier();
  const restart = () => {
    story = input.story();
    chat = input.chatId();
    lastTier = tier();
    scheduler.start(preTargets(story), current(shownBase()));
    notifyAssetsChanged(shownBase()?.key ?? null);
  };
  const refresh = () => {
    if (input.story() !== story || input.chatId() !== chat || tier() !== lastTier) { restart(); return; }
    scheduler.setCurrent(current(shownBase()));
  };
  restart();
  void loopModelsInstalled().then((value) => { installed = value; refresh(); });

  const offProvider = registerAssetProvider({
    id: "loops",
    lookup: async (base) => {
      const wanted = videoTier();
      if (!wanted || base.kind !== "image") return null;
      const still = await stillKey(base.url, wanted);
      const url = still ? published.get(still.key) : undefined;
      return url ? { loopUrl: url } : null;
    },
  });
  const offLayer = registerLayer(CINEMAGRAPH_KIND, (context) => cinemagraphLayer(context), { gate: "loops", auto: cinemagraphAuto });
  const offShown = onBaseShown((base) => scheduler.setCurrent(current(base)));
  const offRuntime = input.subscribe(refresh);
  const offBusy = busyWork.subscribe(() => {
    if (gpuWork(input.chatId()) && scheduler.preempt()) quietSince = Date.now();
  });

  const watch = setInterval(() => {
    if (!scheduler.busy) return;
    void input.hostGenerating().then((loud) => { if (loud && scheduler.preempt()) quietSince = Date.now(); });
  }, 1500);

  return () => {
    clearInterval(watch);
    offBusy();
    offRuntime();
    offShown();
    offLayer();
    offProvider();
    scheduler.stop();
  };
}

import { notifyAssetsChanged, onBaseShown, registerAssetProvider, shownBase } from "../assets";
import type { BackdropBase } from "../types";
import { cachedBackdropLoop, comfyLoopQueue, renderBackdropLoop } from "@services/stHost/backdropLoops";
import { comfyReference, comfyReleaseReference } from "@services/stHost/media";
import { gpuBrokerStatus, releaseGpu, renewGpu, reserveGpu } from "@services/stHost/gpuBroker";
import { busyWork } from "@runtime/busy";
import { log } from "@utils/log";
import { sha256Hex } from "@utils/sha256";
import { couldNot } from "@utils/writeResult";
import { loopKey, loopSeed } from "./key";
import { backgroundNameOf, currentTarget, preTargets, type LoopStory, type LoopTarget } from "./plan";
import { loopPrompt } from "./prompt";
import { LoopScheduler, type ResolvedLoop } from "./scheduler";
import { buildLoopGraph, LOOP_MODEL, LOOP_PROMPT_VERSION, LOOP_SHAPE, loopModelFiles } from "./workflow";

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
  enabled(): boolean;
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

export function startBackdropLoops(input: LoopHostInput): () => void {
  const published = new Map<string, string>();
  const keys = new Map<string, Promise<{ key: string; bytes: ArrayBuffer } | null>>();
  let quietSince = Date.now();

  const stillKey = (still: string): Promise<{ key: string; bytes: ArrayBuffer } | null> => {
    const known = keys.get(still);
    if (known) return known;
    const next = (async () => {
      const response = await fetch(still, { cache: "no-store" });
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      return { key: await loopKey(await sha256Hex(bytes), loopPrompt(backgroundNameOf(still))), bytes };
    })().catch(() => null);
    keys.set(still, next);
    return next;
  };

  const render = async (loop: ResolvedLoop, signal: AbortSignal) => {
    const still = await stillKey(loop.target.still);
    if (!still) return couldNot("The background could not be read.");
    const reference = await comfyReference(await stillPng(still.bytes, signal), signal, { character: "backdrop", set: "loops" });
    try {
      const reservation = await reserveGpu({ signal, width: LOOP_SHAPE.width, height: LOOP_SHAPE.height, needGpuMiB: LOOP_NEED_GPU_MIB, needRamMiB: LOOP_NEED_RAM_MIB,
        workflowKey: JSON.stringify({ recipe: "backdrop-loop", model: LOOP_MODEL.id, frames: LOOP_SHAPE.frames }), modelFiles: loopModelFiles() });
      const renew = reservation.lease ? setInterval(() => { void renewGpu(reservation.lease).catch(() => undefined); }, 30_000) : null;
      try {
        const graph = buildLoopGraph({ image: reference, prompt: loopPrompt(backgroundNameOf(loop.target.still)), key: loop.key, seed: loopSeed(loop.key) });
        return await renderBackdropLoop(loop.key, graph, { model: LOOP_MODEL.id, promptVersion: LOOP_PROMPT_VERSION }, signal);
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
    enabled: input.enabled,
    idle: async () => {
      if (!(await gpuIdle(input))) { quietSince = Date.now(); return false; }
      return Date.now() - quietSince >= LOOP_QUIET_MS;
    },
    resolve: async (target) => {
      const still = await stillKey(target.still);
      return still ? { key: still.key, target } : null;
    },
    cached: async (key, signal) => published.get(key) ?? (await cachedBackdropLoop(key, signal))?.url ?? null,
    render,
    publish: (target, url) => {
      void stillKey(target.still).then((still) => {
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
  scheduler.start(preTargets(story), current(shownBase()));

  const offProvider = registerAssetProvider({
    id: "loops",
    lookup: async (base) => {
      if (!input.enabled() || base.kind !== "image") return null;
      const still = await stillKey(base.url);
      if (!still) return null;
      const url = published.get(still.key);
      return url ? { loopUrl: url } : null;
    },
  });
  const offShown = onBaseShown((base) => scheduler.setCurrent(current(base)));
  const offRuntime = input.subscribe(() => {
    const nextStory = input.story();
    const nextChat = input.chatId();
    if (nextStory !== story || nextChat !== chat) {
      story = nextStory;
      chat = nextChat;
      keys.clear();
      scheduler.start(preTargets(story), current(shownBase()));
      return;
    }
    scheduler.setCurrent(current(shownBase()));
  });
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
    offProvider();
    scheduler.stop();
  };
}

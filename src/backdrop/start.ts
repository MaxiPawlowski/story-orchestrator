import type { RuntimeManager } from "@runtime/runtimeManager";
import {
  backdropReducedMotion, chatColumnRect, chatTextLuminance, hostIsGenerating, mountBackdropRoot, onPageVisibility, pageHidden, readBackdropStill, setBackdropFlags,
  unmountBackdropRoot, watchBackdropStill,
} from "@services/stHost/backdrop";
import { BackdropController, type BackdropHost, type BackdropOverride, type BackdropSources } from "./stage/controller";
import { BackdropRenderer } from "./stage/renderer";
import { registerBuiltInLayers } from "./stage/layers";
import { brightLuminance } from "./stage/contrast";
import { coverTransform } from "./stage/cover";
import { log } from "@utils/log";
import type { BackdropBootContext, BackdropBootHook } from "./types";

export type BackdropManager = Pick<RuntimeManager, "getStory" | "getCachedSnapshot" | "getEffectiveSettings" | "subscribe" | "getOwnership">;

export const BACKDROP_BOOT_HOOKS: BackdropBootHook[] = [
  (context) => import("./loops/host").then(({ startBackdropLoops }) => startBackdropLoops(context)),
];

const bootContext = (manager: BackdropManager): BackdropBootContext => ({
  story: () => manager.getStory(),
  checkpointId: () => manager.getCachedSnapshot().activeCheckpointId,
  chatId: () => manager.getOwnership().mint().chatId || null,
  tier: () => manager.getEffectiveSettings().display.backdrop.loops,
  settings: () => manager.getEffectiveSettings().display.backdrop,
  hostGenerating: hostIsGenerating,
  subscribe: (listener) => manager.subscribe(listener),
});

const runBootHooks = (manager: BackdropManager): Array<() => void> => {
  const stops: Array<() => void> = [];
  let stopped = false;
  for (const hook of BACKDROP_BOOT_HOOKS) {
    void hook(bootContext(manager)).then((stop) => { if (!stop) return; if (stopped) stop(); else stops.push(stop); })
      .catch((error: unknown) => log.warn("A backdrop part did not start", error));
  }
  return [() => { stopped = true; stops.splice(0).forEach((stop) => stop()); }];
};

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = "async";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`could not load ${url}`));
  image.src = url;
});

const loadVideo = (url: string): Promise<HTMLVideoElement> => new Promise((resolve, reject) => {
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  const refused = (error: unknown) => { video.removeAttribute("src"); video.load(); reject(error); };
  video.oncanplay = () => { video.oncanplay = null; video.play().then(() => resolve(video), refused); };
  video.onerror = () => reject(new Error(`could not load ${url}`));
  video.src = url;
});

const browserHost: BackdropHost = {
  readStill: readBackdropStill,
  watchStill: (listener) => watchBackdropStill(() => listener()),
  reducedMotion: backdropReducedMotion,
  hidden: pageHidden,
  onVisibility: onPageVisibility,
  chatColumn: chatColumnRect,
  sampleColumn: (source, column) => {
    if (!(source instanceof HTMLImageElement) || !source.naturalWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 27;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
    const [scaleX, scaleY, offsetX, offsetY] = coverTransform(source.naturalWidth, source.naturalHeight, width, height);
    context.drawImage(source, offsetX * source.naturalWidth, offsetY * source.naturalHeight, scaleX * source.naturalWidth, scaleY * source.naturalHeight, 0, 0, 48, 27);
    const left = Math.floor(((column?.left ?? width * 0.25) / width) * 48), right = Math.ceil(((column?.right ?? width * 0.75) / width) * 48);
    return brightLuminance(context.getImageData(Math.max(0, left), 0, Math.max(1, Math.min(48, right) - Math.max(0, left)), 27).data);
  },
  textLuminance: chatTextLuminance,
  setFlags: (flags) => { setBackdropFlags(flags); },
  viewport: () => ({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 }),
  onResize: (listener) => { window.addEventListener("resize", listener, { passive: true }); return () => window.removeEventListener("resize", listener); },
  onPointer: (listener) => {
    const move = (event: PointerEvent) => event.pointerType !== "mouse" ? undefined
      : listener((event.clientX / Math.max(1, window.innerWidth)) * 2 - 1, (event.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
    const leave = (event: MouseEvent) => { if (!event.relatedTarget) listener(0, 0); };
    const blur = () => listener(0, 0);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("mouseout", leave);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("pointermove", move); document.removeEventListener("mouseout", leave); window.removeEventListener("blur", blur); };
  },
  loadImage,
  loadVideo,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

const sourcesFor = (manager: BackdropManager): BackdropSources => ({
  settings: () => manager.getEffectiveSettings().display.backdrop,
  story: () => manager.getStory(),
  checkpointId: () => manager.getCachedSnapshot().activeCheckpointId,
  values: () => manager.getCachedSnapshot().blackboard ?? {},
  subscribe: (listener) => manager.subscribe(listener),
});

let controller: BackdropController | null = null;
let dispose: (() => void) | null = null;

export interface BackdropDebug {
  view(): ReturnType<BackdropController["view"]>;
  stats(): ReturnType<BackdropController["frameStats"]>;
  override(patch: BackdropOverride | null): void;
  refresh(): void;
}

export function startBackdrop(manager: BackdropManager): BackdropController | null {
  if (controller) return controller;
  const mounted = mountBackdropRoot();
  if (!mounted.ok) { log.warn(`The animated backdrop did not mount: ${mounted.reason}`); return null; }
  const root = mounted.element;
  Object.assign(root.style, { position: "fixed", inset: "0", zIndex: "-1", pointerEvents: "none", overflow: "hidden" });
  const canvas = document.createElement("canvas");
  canvas.id = "so-backdrop-canvas";
  Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", opacity: "0", transition: "opacity 600ms ease" });
  root.appendChild(canvas);
  const lost = (event: Event) => { event.preventDefault(); controller?.contextLost(); };
  const restored = () => { controller?.contextRestored(); };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  const motion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const motionChanged = () => controller?.refresh(true);
  motion?.addEventListener("change", motionChanged);
  const unregister = registerBuiltInLayers();
  const current = new BackdropController(browserHost, sourcesFor(manager), () => new BackdropRenderer(canvas, loadImage),
    (shown) => { canvas.style.opacity = shown ? "1" : "0"; });
  controller = current;
  const stop = current.start();
  const stopHooks = runBootHooks(manager);
  const debug: BackdropDebug = { view: () => current.view(), stats: () => current.frameStats(), override: (patch) => current.setOverride(patch), refresh: () => current.refresh(true) };
  globalThis.storyOrchestratorBackdrop = debug;
  dispose = () => {
    motion?.removeEventListener("change", motionChanged);
    stopHooks.forEach((off) => off());
    stop();
    unregister.forEach((off) => off());
    canvas.remove();
    unmountBackdropRoot();
    Reflect.deleteProperty(globalThis, "storyOrchestratorBackdrop");
  };
  return current;
}

export function stopBackdrop(): void {
  dispose?.();
  dispose = null;
  controller = null;
}

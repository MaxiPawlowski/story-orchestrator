import type { RunGuard } from "@runtime/runToken";
import type { LiveHeadRef } from "../liveHeadRefs";
import type { HeadParameters } from "./drivers";
import { prepareHead, type HeadAssetDeps } from "./load";
import { HeadRenderer } from "./renderer";

export interface HeadSurface { add: HeadRenderer["add"]; draw: HeadRenderer["draw"]; destroy(): void }

export async function attachHead(canvas: HTMLCanvasElement, ref: LiveHeadRef, run: RunGuard, deps: HeadAssetDeps,
  parameters: () => HeadParameters, visible: (ready: boolean) => void,
  factory: (canvas: HTMLCanvasElement, manifest: import("./manifest").HeadManifest) => HeadSurface = (element, manifest) => new HeadRenderer(element, manifest),
): Promise<(() => void) | null> {
  const prepared = await prepareHead(ref, run, deps);
  if (!prepared || !run.stillOwns()) return null;
  const renderer = factory(canvas, prepared.manifest);
  let frame = 0, closed = false, ready = false;
  const stop = () => {
    if (closed) return;
    closed = true; cancelAnimationFrame(frame); visible(false); renderer.destroy();
    canvas.removeEventListener("webglcontextlost", lost); document.removeEventListener("visibilitychange", visibility);
    run.signal.removeEventListener("abort", stop);
  };
  const draw = () => {
    if (closed) return;
    if (!run.stillOwns()) { stop(); return; }
    try { renderer.draw(parameters()); if (!ready) { ready = true; visible(true); } }
    catch { stop(); }
  };
  const tick = () => {
    draw();
    if (!closed && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const lost = (event: Event) => { event.preventDefault(); stop(); };
  const visibility = () => {
    cancelAnimationFrame(frame);
    if (!closed && !document.hidden) tick();
  };
  try {
    for (let i = 0; i < prepared.manifest.layers.length; i++) {
      if (!run.stillOwns()) { stop(); return null; }
      renderer.add(prepared.manifest.layers[i], prepared.images[i]);
    }
    if (!run.stillOwns()) { stop(); return null; }
    canvas.addEventListener("webglcontextlost", lost); document.addEventListener("visibilitychange", visibility);
    run.signal.addEventListener("abort", stop, { once: true });
    if (!document.hidden) tick();
    return stop;
  } catch (error) { stop(); throw error; }
}

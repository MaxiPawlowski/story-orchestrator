import type { RunGuard } from "@runtime/runToken";
import type { LiveHeadRef } from "../liveHeadRefs";
import type { HeadParameters } from "./drivers";
import { prepareHead, type HeadAssetDeps } from "./load";
import { HeadRenderer } from "./renderer";
import { drawnFrames, prepareDrawn, type DrawnDeps, type DrawnSet, type DrawnSource } from "./drawn";
import { mouthRegionProblem, type MeshMouthMode } from "./meshMouth";

export interface HeadSurface { add: HeadRenderer["add"]; draw: HeadRenderer["draw"]; destroy(): void; addDrawn?: HeadRenderer["addDrawn"]; mouthMode?(): MeshMouthMode }
export type MouthReport = (mode: MeshMouthMode, problem: string | null) => void;
export interface HeadDrawn { source: DrawnSource; deps: DrawnDeps; report?(set: DrawnSet | null, error?: unknown): void }

export const FRAME_MS = 1000 / 60;
const FRAME_SLACK_MS = 2;

export function frameGate(interval = FRAME_MS, slack = FRAME_SLACK_MS): (now?: number) => boolean {
  let last = Number.NEGATIVE_INFINITY;
  return (now) => {
    if (now === undefined) { last = Number.NEGATIVE_INFINITY; return true; }
    const elapsed = now - last;
    if (elapsed < interval - slack) return false;
    last = elapsed >= interval && elapsed < 2 * interval ? now - (elapsed - interval) : now;
    return true;
  };
}

export async function attachHead(canvas: HTMLCanvasElement, ref: LiveHeadRef, run: RunGuard, deps: HeadAssetDeps,
  parameters: () => HeadParameters, visible: (ready: boolean) => void,
  factory: (canvas: HTMLCanvasElement, manifest: import("./manifest").HeadManifest) => HeadSurface = (element, manifest) => new HeadRenderer(element, manifest),
  drawn?: HeadDrawn, mouth?: MouthReport,
): Promise<(() => void) | null> {
  const prepared = await prepareHead(ref, run, deps);
  if (!prepared || !run.stillOwns()) return null;
  let sprites: DrawnSet | null = null;
  if (drawn && drawnFrames(drawn.source).length) {
    try {
      sprites = await prepareDrawn(prepared.manifest.rig, prepared.manifest.artHash, prepared.art, drawn.source, run, drawn.deps);
      drawn.report?.(sprites);
    } catch (error) { sprites = null; drawn.report?.(null, error); }
    if (!run.stillOwns()) return null;
  }
  const renderer = factory(canvas, prepared.manifest);
  let frame = 0, closed = false, ready = false;
  const gate = frameGate();
  const stop = () => {
    if (closed) return;
    closed = true; cancelAnimationFrame(frame); visible(false); renderer.destroy();
    canvas.removeEventListener("webglcontextlost", lost); document.removeEventListener("visibilitychange", visibility);
    run.signal.removeEventListener("abort", stop);
  };
  const draw = () => {
    if (closed) return;
    if (!run.stillOwns()) { stop(); return; }
    try { renderer.draw(parameters(), performance.now()); if (!ready) { ready = true; visible(true); } }
    catch { stop(); }
  };
  const tick = (time?: number) => {
    if (gate(time)) draw();
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
    if (sprites?.sprites.length && renderer.addDrawn) renderer.addDrawn(sprites.sprites);
    mouth?.(renderer.mouthMode?.() ?? "full", mouthRegionProblem(prepared.manifest.rig));
    if (!run.stillOwns()) { stop(); return null; }
    canvas.addEventListener("webglcontextlost", lost); document.addEventListener("visibilitychange", visibility);
    run.signal.addEventListener("abort", stop, { once: true });
    if (!document.hidden) tick();
    return stop;
  } catch (error) { stop(); throw error; }
}

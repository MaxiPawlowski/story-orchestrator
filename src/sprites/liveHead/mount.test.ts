import { attachHead, type HeadSurface } from "./mount";
import { restHead } from "./drivers";
import { syntheticHead, syntheticRef } from "./synthetic";
import type { HeadAssetDeps } from "./load";
import type { RunGuard } from "@runtime/runToken";

class Page extends EventTarget { hidden = false }
const bytes = new TextEncoder().encode(JSON.stringify(syntheticHead)).buffer as ArrayBuffer;
const assets = (): HeadAssetDeps => ({ bytes: async () => bytes, hash: async () => syntheticHead.artHash, image: async () => ({} as HTMLImageElement) });
const surface = (): HeadSurface => ({ add: jest.fn(), draw: jest.fn(), destroy: jest.fn() });
let page: Page, frames: Map<number, FrameRequestCallback>, frameId: number;
const original = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
beforeEach(() => {
  page = new Page(); frames = new Map(); frameId = 0;
  Object.assign(globalThis, { document: page,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id) });
});
afterEach(() => Object.assign(globalThis, original));
const owner = (controller = new AbortController(), check = () => true): RunGuard => ({ signal: controller.signal, stillOwns: () => !controller.signal.aborted && check(),
  release: () => undefined, lapsed: () => null, lapsedDetail: () => null });
const frame = () => { const [id, callback] = [...frames][0]; frames.delete(id); callback(0); };

test("first successful draw reveals once; context loss restores static synchronously and releases resources", async () => {
  const canvas = new EventTarget() as HTMLCanvasElement, renderer = surface(), visible = jest.fn();
  const stop = await attachHead(canvas, syntheticRef, owner(), assets(), restHead, visible, () => renderer);
  expect(renderer.add).toHaveBeenCalledTimes(9); expect(visible.mock.calls).toEqual([[true]]);
  frame(); expect(visible.mock.calls).toEqual([[true]]);
  const lost = new Event("webglcontextlost", { cancelable: true }); canvas.dispatchEvent(lost);
  expect(lost.defaultPrevented).toBe(true); expect(visible.mock.calls).toEqual([[true], [false]]);
  expect(renderer.destroy).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
  stop?.(); expect(renderer.destroy).toHaveBeenCalledTimes(1);
});

test.each(["upload", "draw"])("a %s failure restores static without waiting for another frame", async (where) => {
  const renderer = surface(), visible = jest.fn();
  (renderer[where === "upload" ? "add" : "draw"] as jest.Mock).mockImplementation(() => { throw new Error("failed"); });
  const result = attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, owner(), assets(), restHead, visible, () => renderer);
  if (where === "upload") await expect(result).rejects.toThrow("failed"); else (await result)?.();
  expect(visible.mock.calls).toEqual([[false]]); expect(renderer.destroy).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
});

test("missing WebGL leaves the existing static image in place", async () => {
  const visible = jest.fn();
  await expect(attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, owner(), assets(), restHead, visible, () => { throw new Error("WebGL2 unavailable"); }))
    .rejects.toThrow("WebGL2 unavailable");
  expect(visible).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
});

test("hidden pages suspend drawing; abort still disposes immediately while hidden", async () => {
  const abort = new AbortController(), renderer = surface(), visible = jest.fn();
  await attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, owner(abort), assets(), restHead, visible, () => renderer);
  page.hidden = true; page.dispatchEvent(new Event("visibilitychange"));
  expect(frames.size).toBe(0); expect(renderer.draw).toHaveBeenCalledTimes(1);
  page.hidden = false; page.dispatchEvent(new Event("visibilitychange"));
  expect(renderer.draw).toHaveBeenCalledTimes(2); expect(frames.size).toBe(1);
  page.hidden = true; page.dispatchEvent(new Event("visibilitychange")); abort.abort();
  expect(visible.mock.calls).toEqual([[true], [false]]); expect(renderer.destroy).toHaveBeenCalledTimes(1);
  page.hidden = false; page.dispatchEvent(new Event("visibilitychange")); expect(frames.size).toBe(0);
});

test("a chat change during decoding allocates no renderer; ownership loss on a frame stops drawing", async () => {
  let current = true;
  const renderer = surface(), visible = jest.fn(), factory = jest.fn(() => renderer), deps = assets();
  deps.image = async () => { current = false; return {} as HTMLImageElement; };
  expect(await attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, owner(undefined, () => current), deps, restHead, visible, factory)).toBeNull();
  expect(factory).not.toHaveBeenCalled(); expect(visible).not.toHaveBeenCalled();
  current = true;
  await attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, owner(undefined, () => current), assets(), restHead, visible, factory);
  current = false; frame();
  expect(visible.mock.calls).toEqual([[true], [false]]); expect(renderer.draw).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
});

test("the surface's mouth mode and the rig's mouth problem are reported once the head is built", async () => {
  const renderer = { ...surface(), mouthMode: () => "capped" as const }, report = jest.fn();
  const stop = await attachHead(new EventTarget() as HTMLCanvasElement, syntheticRef, owner(), assets(), restHead, jest.fn(), () => renderer, undefined, report);
  expect(report).toHaveBeenCalledWith("capped", null);
  stop?.();
});

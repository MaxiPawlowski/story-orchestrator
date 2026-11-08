import { DepthCache, MAX_FAILURES, RETRY_MS, type DepthDeps } from "./cache";
import { depthCacheKey, depthPath, uploadSize, DEPTH_MODEL } from "./key";
import { farThreshold, sceneMask, skyMask } from "./mask";
import { cameraOffset, clampStrength, easeToward, fogDensity, MAX_STRENGTH, PARALLAX, sampleUv } from "./parallax";
import { depthGraph } from "./graph";

const HASH = "a".repeat(64);
const OTHER = "b".repeat(64);

function harness(overrides: Partial<DepthDeps> = {}) {
  let clock = 1_000;
  const stored = new Set<string>();
  const produced: string[] = [];
  const queued: string[] = [];
  const deps: DepthDeps = {
    identify: jest.fn(async (url: string) => ({ sha256: url.includes("other") ? OTHER : HASH })),
    exists: jest.fn(async (path: string) => stored.has(path)),
    canProduce: jest.fn(async () => true),
    enqueue: jest.fn(async <T,>(label: string, run: (signal: AbortSignal) => Promise<T>) => { queued.push(label); return run(new AbortController().signal); }),
    produce: jest.fn(async (_url: string, key: string) => { produced.push(key); stored.add(depthPath(key)); return depthPath(key); }),
    now: () => clock,
    ...overrides,
  };
  return { deps, cache: new DepthCache(deps), stored, produced, queued, tick: (ms: number) => { clock += ms; } };
}

const signal = () => new AbortController().signal;

describe("depth key", () => {
  test("is the background's content hash plus model, resolution and recipe version", () => {
    const key = depthCacheKey(HASH);
    expect(key).toBe(`${"a".repeat(32)}-dav2-vitl-r512-v1`);
    expect(depthCacheKey(HASH, { ...DEPTH_MODEL, resolution: 768 })).not.toBe(key);
    expect(depthCacheKey(HASH, { ...DEPTH_MODEL, version: 2 })).not.toBe(key);
    expect(depthPath(key)).toBe(`user/images/so-backdrop-depth/${key}.png`);
    expect(() => depthCacheKey("background.png")).toThrow(/sha256/);
  });

  test("uploads shrink to the long side cap and keep the aspect", () => {
    expect(uploadSize(1920, 1080)).toEqual({ width: 1024, height: 576 });
    expect(uploadSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(() => uploadSize(0, 10)).toThrow();
  });

  test("the depth graph loads only an owned reference with an approved file and previews instead of saving", () => {
    const graph = depthGraph("story-orchestrator/so_x.png");
    expect(Object.values(graph).map((node) => node.class_type)).toEqual(["LoadImage", "DepthAnythingV2Preprocessor", "PreviewImage"]);
    expect(graph[2].inputs).toMatchObject({ ckpt_name: "depth_anything_v2_vitl.pth", resolution: 512 });
    expect(() => depthGraph("../input/x.png")).toThrow(/owned/);
    expect(() => depthGraph("story-orchestrator/so_x.png", { ...DEPTH_MODEL, ckpt: "evil.pth" })).toThrow(/approved/);
  });
});

describe("depth cache", () => {
  test("a stored depth map is a hit without producing, and the hash is read once per background", async () => {
    const { cache, stored, deps } = harness();
    stored.add(depthPath(depthCacheKey(HASH)));
    const assets = await cache.request("/backgrounds/a.png", signal());
    expect(assets).toEqual({ depthUrl: `/${depthPath(depthCacheKey(HASH))}` });
    await cache.request("/backgrounds/a.png", signal());
    expect(deps.produce).not.toHaveBeenCalled();
    expect(deps.identify).toHaveBeenCalledTimes(1);
    expect(cache.state("/backgrounds/a.png")).toBe("cached");
    expect(cache.peek("/backgrounds/a.png")).toEqual(assets);
  });

  test("a miss produces once through the image queue, concurrent requests share the job, listeners hear the result", async () => {
    const { cache, produced, queued } = harness();
    const heard: string[] = [];
    cache.subscribe((url) => heard.push(url));
    const [first, second] = await Promise.all([cache.request("/backgrounds/a.png", signal()), cache.request("/backgrounds/a.png", signal())]);
    expect(first).toEqual(second);
    expect(produced).toEqual([depthCacheKey(HASH)]);
    expect(queued).toEqual(["Backdrop depth"]);
    expect(heard).toEqual(["/backgrounds/a.png"]);
  });

  test("two urls with the same bytes share one depth map", async () => {
    const { cache, produced } = harness();
    await cache.request("/backgrounds/a.png", signal());
    await cache.request("/user/images/copy-of-a.png", signal());
    expect(produced).toHaveLength(1);
  });

  test("nothing is produced while production is off (images off, no media plugin); a cache hit still answers", async () => {
    const { cache, deps, stored } = harness({ canProduce: jest.fn(async () => false) });
    expect(await cache.request("/backgrounds/a.png", signal())).toBeNull();
    expect(deps.enqueue).not.toHaveBeenCalled();
    expect(cache.state("/backgrounds/a.png")).toBe("off");
    stored.add(depthPath(depthCacheKey(HASH)));
    expect(await cache.request("/backgrounds/a.png", signal())).not.toBeNull();
  });

  test("a failed render backs off, then gives up after the cap; a cancelled one does not count", async () => {
    const produce = jest.fn(async (): Promise<string> => { throw new Error("ComfyUI stopped answering"); });
    const { cache, tick } = harness({ produce });
    expect(await cache.request("/backgrounds/a.png", signal())).toBeNull();
    expect(cache.lastFailure("/backgrounds/a.png")).toMatch(/ComfyUI/);
    await cache.request("/backgrounds/a.png", signal());
    expect(produce).toHaveBeenCalledTimes(1);
    for (let attempt = 1; attempt < MAX_FAILURES + 2; attempt += 1) { tick(RETRY_MS); await cache.request("/backgrounds/a.png", signal()); }
    expect(produce).toHaveBeenCalledTimes(MAX_FAILURES);
    const cancelled = harness({ produce: jest.fn(async (): Promise<string> => { throw new DOMException("Cancelled", "AbortError"); }) });
    await cancelled.cache.request("/backgrounds/a.png", signal());
    await cancelled.cache.request("/backgrounds/a.png", signal());
    expect(cancelled.deps.produce).toHaveBeenCalledTimes(2);
  });

  test("an unreadable background is a failed lookup, never a render", async () => {
    const { cache, deps } = harness({ identify: jest.fn(async () => { throw new Error("404"); }) });
    expect(await cache.request("/backgrounds/gone.png", signal())).toBeNull();
    expect(deps.produce).not.toHaveBeenCalled();
    expect(cache.state("/backgrounds/gone.png")).toBe("failed");
  });

  test("a mask rides along when the mask step makes one, and a mask failure keeps the depth", async () => {
    const withMask = harness({ mask: jest.fn(async () => "blob:mask") });
    expect(await withMask.cache.request("/backgrounds/a.png", signal())).toMatchObject({ maskUrl: "blob:mask" });
    const broken = harness({ mask: jest.fn(async () => { throw new Error("no canvas"); }) });
    expect(await broken.cache.request("/backgrounds/a.png", signal())).toEqual({ depthUrl: expect.stringContaining("so-backdrop-depth") });
  });
});

const depthImage = (rows: number[][]): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(rows.length * rows[0].length * 4);
  rows.flat().forEach((value, index) => { out.set([value, value, value, 255], index * 4); });
  return out;
};

describe("sky mask", () => {
  test("marks only far pixels connected to the top edge", () => {
    const rows = [
      [0, 0, 0, 0],
      [0, 0, 200, 0],
      [200, 200, 200, 200],
      [255, 0, 255, 255],
    ];
    const mask = skyMask(depthImage(rows), 4, 4, { far: 0.1, feather: 0, minShare: 0 });
    const red = Array.from({ length: 16 }, (_, index) => (mask as Uint8ClampedArray)[index * 4]);
    expect(red).toEqual([255, 255, 255, 255, 255, 255, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("no mask when the far region is too small to be a sky", () => {
    const rows = [[255, 255, 255, 0], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255]];
    expect(skyMask(depthImage(rows), 4, 4, { far: 0.1, feather: 0, minShare: 0.25 })).toBeNull();
  });

  test("the far threshold follows the map's own range", () => {
    expect(farThreshold(depthImage([[20, 220]]), 2, 0.1)).toBe(40);
  });

  test("feathering softens the edge without leaking far", () => {
    const rows = Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, () => (y < 3 ? 0 : 255)));
    const mask = skyMask(depthImage(rows), 6, 6, { far: 0.1, feather: 1, minShare: 0 }) as Uint8ClampedArray;
    const column = [0, 1, 2, 3, 4, 5].map((y) => mask[(y * 6 + 2) * 4]);
    expect(column[0]).toBe(255);
    expect(column[2]).toBeGreaterThan(0);
    expect(column[2]).toBeLessThan(255);
    expect(column[5]).toBe(0);
  });
});

describe("scene mask channels", () => {
  const scene = (rgbBelow: [number, number, number], depthBelow: (x: number, y: number) => number) => {
    const width = 20, height = 20;
    const depth = new Uint8ClampedArray(width * height * 4), color = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4, d = y < 8 ? 0 : depthBelow(x, y), c = y < 8 ? [120, 170, 230] : rgbBelow;
      depth.set([d, d, d, 255], index); color.set([...c, 255], index);
    }
    return sceneMask(depth, color, width, height) as Uint8ClampedArray;
  };
  const share = (mask: Uint8ClampedArray, channel: number) => { let n = 0; for (let i = channel; i < mask.length; i += 4) n += mask[i] > 127 ? 1 : 0; return n / (mask.length / 4); };

  test("R is sky, G is flat blue water below it, B stays free for the loop tier, A is opaque", () => {
    const mask = scene([60, 110, 190], (_x, y) => 100 + y);
    expect(share(mask, 0)).toBeCloseTo(0.4, 1);
    expect(share(mask, 1)).toBeGreaterThan(0.3);
    expect(share(mask, 2)).toBe(0);
    expect(mask[3]).toBe(255);
  });

  test("a grey road or a bumpy blue surface is not water", () => {
    expect(share(scene([150, 150, 150], (_x, y) => 100 + y), 1)).toBe(0);
    expect(share(scene([60, 110, 190], (x, y) => ((x + y) % 2 ? 90 : 200)), 1)).toBe(0);
  });

  test("mountains a little nearer than the sky plateau are not sky", () => {
    const width = 10, height = 10, depth = new Uint8ClampedArray(400);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const d = y < 3 ? 0 : y < 6 ? 8 : 60 + y * 15;
      depth.set([d, d, d, 255], (y * width + x) * 4);
    }
    const mask = sceneMask(depth, null, width, height) as Uint8ClampedArray;
    expect(mask[(1 * width + 5) * 4]).toBeGreaterThan(127);
    expect(mask[(5 * width + 5) * 4]).toBeLessThan(40);
  });

  test("water grows from blue seeds across reflections on the same ground plane, not up a far slope", () => {
    const mask = scene([60, 110, 190], (_x, y) => 100 + y);
    const reflected = scene([200, 90, 60], (_x, y) => 100 + y);
    expect(share(reflected, 1)).toBe(0);
    expect(share(mask, 1)).toBeGreaterThan(0.5);
  });

  test("no colour means sky only", () => {
    const width = 4, height = 4, depth = new Uint8ClampedArray(64);
    for (let i = 0; i < 16; i += 1) depth.set(i < 8 ? [0, 0, 0, 255] : [200, 200, 200, 255], i * 4);
    expect(share(sceneMask(depth, null, width, height) as Uint8ClampedArray, 1)).toBe(0);
  });
});

describe("parallax math", () => {
  test("the overscan keeps every displaced sample inside the image, so edges never stretch", () => {
    for (const strength of [0, 0.01, PARALLAX.strength, MAX_STRENGTH, 0.5]) {
      const params = { strength: clampStrength(strength), focus: PARALLAX.focus };
      for (const uv of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0.5, y: 0.5 }]) {
        for (const depth of [0, 1]) {
          for (const offset of [{ x: params.strength, y: 0 }, { x: -params.strength, y: params.strength }, { x: 0, y: -params.strength }]) {
            const sample = sampleUv(uv, offset, depth, params);
            expect(sample.x).toBeGreaterThanOrEqual(-1e-9);
            expect(sample.x).toBeLessThanOrEqual(1 + 1e-9);
            expect(sample.y).toBeGreaterThanOrEqual(-1e-9);
            expect(sample.y).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });

  test("near pixels move more than far ones, and the focus plane stays put", () => {
    const offset = { x: 0.02, y: 0 };
    const params = { strength: 0.02, focus: 0.35 };
    const still = sampleUv({ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, 0.5, params);
    const near = sampleUv({ x: 0.5, y: 0.5 }, offset, 1, params);
    const far = sampleUv({ x: 0.5, y: 0.5 }, offset, 0, params);
    const focus = sampleUv({ x: 0.5, y: 0.5 }, offset, 0.35, params);
    expect(Math.abs(near.x - still.x)).toBeGreaterThan(Math.abs(far.x - still.x));
    expect(Math.sign(near.x - still.x)).toBe(-Math.sign(far.x - still.x));
    expect(focus.x).toBeCloseTo(still.x, 12);
  });

  test("the camera offset never exceeds the strength, scales with intensity and is still with no motion", () => {
    for (let t = 0; t < 120; t += 7.3) for (const pointer of [null, { x: 1, y: 1 }, { x: -5, y: 9 }]) {
      const offset = cameraOffset(t, pointer, PARALLAX);
      expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(PARALLAX.strength + 1e-12);
    }
    expect(cameraOffset(3, { x: 1, y: 0 }, PARALLAX, 0)).toEqual({ x: 0, y: 0 });
    const half = cameraOffset(3, { x: 1, y: 0 }, PARALLAX, 0.5), full = cameraOffset(3, { x: 1, y: 0 }, PARALLAX, 1);
    expect(half.x).toBeCloseTo(full.x / 2, 12);
  });

  test("pointer tilt eases in instead of jumping", () => {
    const first = easeToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 1 / 60);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(0.05);
    expect(easeToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.6).x).toBeCloseTo(0.5, 6);
  });

  test("fog is denser in fog and rain, thinner indoors, and off at zero intensity", () => {
    expect(fogDensity({ weather: "fog" }, 1)).toBeGreaterThan(fogDensity({ weather: "rain" }, 1));
    expect(fogDensity({ weather: "rain" }, 1)).toBeGreaterThan(fogDensity({}, 1));
    expect(fogDensity({ indoor: true }, 1)).toBeLessThan(fogDensity({}, 1));
    expect(fogDensity({ weather: "fog" }, 0)).toBe(0);
  });
});

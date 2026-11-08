import { BackdropController, effectFor, type BackdropHost, type BackdropSources } from "./controller";
import type { BackdropRenderer } from "./renderer";
import { registerBuiltInLayers } from "./layers";
import { registerAssetProvider } from "../assets";
import { defaultBackdropSettings } from "../settings";
import type { BackdropBase, BackdropLayerSpec, BackdropSettings } from "../types";
import type { NormalizedStory } from "@engine/index";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const fakeRenderer = () => {
  const calls = { bases: [] as BackdropBase[], layers: [] as string[][], draws: 0, disposed: 0 };
  let shown: BackdropBase | null = null, kinds: string[] = [];
  const renderer = {
    width: 0, height: 0,
    get shownBase() { return shown; },
    setBase: (base: BackdropBase) => { shown = base; calls.bases.push(base); },
    setLayers: (specs: readonly BackdropLayerSpec[]) => { kinds = specs.map((spec) => spec.kind); calls.layers.push(kinds); },
    layerKinds: () => kinds,
    resize: (width: number, height: number) => { renderer.width = width; renderer.height = height; },
    fading: () => false,
    frameRate: () => 60,
    setPlaying: () => undefined,
    markLost: () => undefined,
    hasVideo: () => shown?.kind === "video",
    draw: () => { calls.draws += 1; },
    dispose: () => { calls.disposed += 1; },
  };
  return { renderer: renderer as unknown as BackdropRenderer, calls };
};

const setup = (options: { still?: string | null; reduced?: boolean; settings?: Partial<BackdropSettings>; values?: Record<string, unknown>; story?: NormalizedStory | null; noGl?: boolean; sample?: number } = {}) => {
  let listener: () => void = () => undefined;
  const frames: Array<(now: number) => void> = [];
  const flags: Array<{ active: boolean; dim: boolean }> = [];
  const shown: boolean[] = [];
  let settings: BackdropSettings = { ...defaultBackdropSettings(), ...options.settings };
  let values = options.values ?? {};
  let reduced = options.reduced ?? false;
  const still = options.still === undefined ? "backgrounds/forest.jpg" : options.still;
  const host: BackdropHost = {
    readStill: () => (still ? { url: still, key: still.split("/").pop() as string } : null),
    watchStill: () => () => undefined,
    reducedMotion: () => reduced,
    hidden: () => false,
    onVisibility: () => () => undefined,
    chatColumn: () => ({ left: 500, right: 1400 }),
    sampleColumn: () => options.sample ?? 0.6,
    textLuminance: () => 0.9,
    setFlags: (next) => { flags.push(next); },
    viewport: () => ({ width: 1920, height: 1080, dpr: 1 }),
    onResize: () => () => undefined,
    onPointer: () => () => undefined,
    loadImage: async () => ({}) as HTMLImageElement,
    loadVideo: async () => ({ pause: () => undefined }) as unknown as HTMLVideoElement,
    requestFrame: (callback) => { frames.push(callback); return frames.length; },
    cancelFrame: () => undefined,
    now: () => 1000,
  };
  const sources: BackdropSources = {
    settings: () => settings, story: () => options.story ?? null, checkpointId: () => "start", values: () => values,
    subscribe: (next) => { listener = next; return () => undefined; },
  };
  const fake = fakeRenderer();
  const controller = new BackdropController(host, sources, () => { if (options.noGl) throw new Error("no webgl"); return fake.renderer; }, (on) => shown.push(on));
  return {
    controller, calls: fake.calls, flags, shown, frames,
    set: (patch: { settings?: Partial<BackdropSettings>; values?: Record<string, unknown>; reduced?: boolean }) => {
      if (patch.settings) settings = { ...settings, ...patch.settings };
      if (patch.values) values = patch.values;
      if (patch.reduced !== undefined) reduced = patch.reduced;
      listener();
    },
  };
};

let unregister: Array<() => void> = [];
beforeAll(() => { unregister = registerBuiltInLayers(); });
afterAll(() => unregister.forEach((off) => off()));

describe("v3.0 45 A: backdrop controller", () => {
  it("shows the still with layers chosen from state, and switches them when state changes", async () => {
    const run = setup({ values: { weather: "rain" } });
    const stop = run.controller.start();
    await flush();
    expect(run.calls.bases.map((base) => base.kind)).toEqual(["image"]);
    expect(run.controller.view().layers).toEqual(["drift", "rain"]);
    expect(run.flags.at(-1)).toEqual({ active: true, dim: true });
    expect(run.shown.at(-1)).toBe(true);
    expect(run.frames.length).toBeGreaterThan(0);
    run.set({ values: { weather: "snow" } });
    expect(run.controller.view().layers).toEqual(["drift", "snow"]);
    stop();
    expect(run.flags.at(-1)).toEqual({ active: false, dim: false });
  });

  it("reduced motion shows the still once and runs no frame loop", async () => {
    const run = setup({ values: { weather: "rain" }, reduced: true });
    run.controller.start();
    await flush();
    expect(run.controller.view()).toMatchObject({ active: true, reducedMotion: true, layers: [], running: false });
    expect(run.calls.draws).toBeGreaterThan(0);
    expect(run.frames).toEqual([]);
  });

  it("falls back to SillyTavern's background without a still, with the switch off, or without WebGL", async () => {
    for (const options of [{ still: null }, { settings: { enabled: false } }, { noGl: true }]) {
      const run = setup(options);
      run.controller.start();
      await flush();
      expect(run.controller.view().active).toBe(false);
      expect(run.flags.every((flag) => !flag.active)).toBe(true);
    }
  });

  it("turning the switch off tears the canvas down", async () => {
    const run = setup();
    run.controller.start();
    await flush();
    run.set({ settings: { enabled: false } });
    expect(run.calls.disposed).toBe(1);
    expect(run.shown.at(-1)).toBe(false);
  });

  it("swaps the base to a video loop when an asset provider has one and loops are on", async () => {
    const off = registerAssetProvider({ id: "test-loop", lookup: (base) => ({ loopUrl: `loops/${base.key}.webm` }) });
    const run = setup();
    run.controller.start();
    await flush(); await flush();
    expect(run.calls.bases.map((base) => base.kind)).toEqual(["image", "video"]);
    run.set({ settings: { loops: "off" } });
    await flush();
    expect(run.calls.bases.at(-1)?.kind).toBe("image");
    off();
  });

  it("dims behind the chat until light text reaches 4.5:1 on the sRGB blend, within the cap", async () => {
    const bright = setup({ sample: 0.8 });
    bright.controller.start();
    await flush();
    const dark = setup({ sample: 0.02 });
    dark.controller.start();
    await flush();
    expect(bright.controller.view().dim).toBeCloseTo(0.513, 3);
    expect(dark.controller.view().dim).toBe(0.18);
  });

  it("reads the active checkpoint's backdrop over the story default", () => {
    const story = { backdrop_defaults: { weather: "snow", layers: [] }, checkpointById: { start: { effects: { backdrop: { weather: "fog" } } } } } as unknown as NormalizedStory;
    expect(effectFor(story, "start")).toEqual({ weather: "fog", layers: [] });
    expect(effectFor(story, "other")).toEqual({ weather: "snow", layers: [] });
    expect(effectFor(null, "start")).toBeNull();
  });
});

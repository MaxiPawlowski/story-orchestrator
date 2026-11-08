import { autoLayers, onLayersChanged, registerLayer, registeredKinds, registeredLayer } from "./stage/registry";
import { lookupAssets, noteBaseShown, onAssetsChanged, onBaseShown, registerAssetProvider, shownBase } from "./assets";
import { defaultBackdropSettings, sanitizeBackdropSettings } from "./settings";
import { stillFromLayer } from "./still";
import type { BackdropAutoInput, BackdropLayer } from "./types";

const layer = (kind: string): BackdropLayer => ({ kind, order: 1, draw: () => undefined, dispose: () => undefined });
const base = { kind: "image" as const, url: "backgrounds/tavern.jpg", key: "tavern.jpg" };
const input = (patch: Partial<BackdropAutoInput["settings"]> = {}): BackdropAutoInput => ({
  state: { sceneKey: "tavern.jpg", weather: null, timeOfDay: null, tension: 0 }, assets: { depthUrl: "d.png" }, base, settings: { ...defaultBackdropSettings(), ...patch },
});

describe("v3.0 45 contract: layer registry", () => {
  it("registers a kind, replaces it, and unregisters only its own entry", () => {
    let changes = 0;
    const off = onLayersChanged(() => { changes += 1; });
    const first = registerLayer("test-a", () => layer("test-a"));
    const second = registerLayer("test-a", () => layer("test-a"), { gate: "parallax" });
    first();
    expect(registeredLayer("test-a")?.gate).toBe("parallax");
    second();
    off();
    expect(registeredKinds()).not.toContain("test-a");
    expect(changes).toBe(3);
  });

  it("proposes auto layers only while their gate is open", () => {
    const stop = registerLayer("test-depth", () => layer("test-depth"), { gate: "parallax", auto: ({ assets }) => (assets.depthUrl ? { id: "test-depth", kind: "test-depth", params: {} } : null) });
    expect(autoLayers(input()).map((spec) => spec.kind)).toContain("test-depth");
    expect(autoLayers(input({ parallax: false }))).toEqual([]);
    expect(autoLayers(input({ enabled: false }))).toEqual([]);
    stop();
    const loop = registerLayer("test-loop", () => layer("test-loop"), { gate: "loops", auto: () => ({ id: "test-loop", kind: "test-loop", params: {} }) });
    expect(autoLayers(input({ loops: "off" }))).toEqual([]);
    expect(autoLayers(input({ loops: "cinemagraph" })).map((spec) => spec.kind)).toEqual(["test-loop"]);
    loop();
  });
});

describe("v3.0 45 contract: asset port", () => {
  it("merges providers, drops empty values and survives a failing provider", async () => {
    const changes: Array<string | null> = [];
    const off = onAssetsChanged((key) => changes.push(key));
    const a = registerAssetProvider({ id: "depth", lookup: () => ({ depthUrl: "depth.png", maskUrl: "" }) });
    const b = registerAssetProvider({ id: "loop", lookup: async () => ({ loopUrl: "loop.webm" }) });
    const c = registerAssetProvider({ id: "broken", lookup: () => { throw new Error("no"); } });
    expect(await lookupAssets(base)).toEqual({ depthUrl: "depth.png", loopUrl: "loop.webm" });
    [a, b, c, off].forEach((stop) => stop());
    expect(await lookupAssets(base)).toEqual({});
    expect(changes.length).toBeGreaterThanOrEqual(3);
  });

  it("announces a newly shown base once", () => {
    const seen: Array<string | undefined> = [];
    const off = onBaseShown((shown) => seen.push(shown?.key));
    noteBaseShown(base);
    expect(shownBase()).toEqual(base);
    noteBaseShown({ ...base });
    noteBaseShown(null);
    off();
    expect(seen).toEqual(["tavern.jpg", undefined]);
  });
});

describe("v3.0 45 contract: settings and host still", () => {
  it("defaults on, clamps intensity", () => {
    expect(sanitizeBackdropSettings(undefined)).toEqual(defaultBackdropSettings());
    expect(sanitizeBackdropSettings({ effects: false, intensity: 7 })).toMatchObject({ enabled: true, effects: false, intensity: 1 });
    expect(sanitizeBackdropSettings({ intensity: "x" }).intensity).toBe(0.5);
    expect(sanitizeBackdropSettings({ loops: "lite" }).loops).toBe("lite");
    expect(sanitizeBackdropSettings({ loops: true }).loops).toBe("full");
  });

  it("reads the still's url and key from #bg1's background-image", () => {
    expect(stillFromLayer({ image: 'url("backgrounds/Tavern%20Night.jpg")' })).toEqual({ url: "backgrounds/Tavern%20Night.jpg", key: "tavern night.jpg" });
    expect(stillFromLayer({ image: "url(backgrounds/__transparent.png)" })).toBeNull();
    expect(stillFromLayer(null)).toBeNull();
  });
});

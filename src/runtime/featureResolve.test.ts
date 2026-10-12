import { defaultGlobalSettings } from "./settingsModel";
import { featureSettings, resolveFeatures } from "./featureResolve";
import { readFeaturePolicies } from "@engine/featurePolicy";
import { applyDeviceSettings, deviceSettingsStore } from "./deviceSettings";

describe("story feature resolution", () => {
  it("inherits, tunes, declines, re-enables and respects the install master switch", () => {
    const global = defaultGlobalSettings();
    const story = { features: { inner: "off", reading: { cadence: 7 } } } as const;
    const authored = resolveFeatures(global, story);
    expect(authored.inner).toMatchObject({ enabled: false, source: "story", declined: true, reenabled: false });
    expect(authored.reading.controls.cadence).toEqual({ value: 7, source: "story" });
    const overridden = resolveFeatures(global, story, { inner: { enabled: true }, reading: { cadence: 2 } });
    expect(overridden.inner).toMatchObject({ enabled: true, source: "chat", declined: true, reenabled: true });
    expect(overridden.reading.controls.cadence).toEqual({ value: 2, source: "chat" });
    global.memory.innerBeat = false;
    expect(resolveFeatures(global, story, { inner: { enabled: true } }).inner)
      .toMatchObject({ enabled: false, source: "install", masterOff: true, reenabled: false });
  });

  it("a tuning-only chat override preserves a story decline", () => {
    expect(resolveFeatures(defaultGlobalSettings(), { features: { inner: "off" } }, { inner: { fanOut: "top2" } }).inner.enabled).toBe(false);
  });

  it("maps effective settings without mutating install defaults and stops dependent work", () => {
    const global = defaultGlobalSettings(), before = JSON.stringify(global);
    const resolved = resolveFeatures(global, { features: { branching: "off", inner: "off", agency: "off", meanwhile: "off" } });
    const effective = featureSettings(global, resolved);
    expect(effective.stagecraft.prefetchEnabled).toBe(false);
    expect(effective.memory.harvestReasoning).toBe(false);
    expect(effective.stagecraft.agencyAcceptMode).toBe("off");
    expect(effective.stagecraft.meanwhileAcceptMode).toBe("off");
    expect(JSON.stringify(global)).toBe(before);
  });

  it("validates policy names, values and integer bounds without accepting authored content", () => {
    const issues: string[] = [];
    const result = readFeaturePolicies({ reading: { cadence: 0, stabilityLag: 1.5 }, curator: { lorebooks: ["private"], create: true }, unknown: "off" },
      (path) => issues.push(path));
    expect(result).toEqual({ curator: { create: true } });
    expect(issues).toEqual(["features.reading.cadence", "features.reading.stabilityLag", "features.curator.lorebooks", "features.unknown"]);
  });
});

describe("device preferences", () => {
  it("separates accounts and accepts display-only preferences", () => {
    const values = new Map<string, string>();
    let user = "first";
    const store = deviceSettingsStore({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, () => user);
    store.set("sprites.blink", false);
    user = "second";
    expect(store.read()).toEqual({});
    user = "first";
    const global = defaultGlobalSettings();
    expect(applyDeviceSettings(global, store.read()).sprites.blink).toBe(false);
    expect(global.sprites.blink).toBe(true);
    store.set("sprites.blink", undefined);
    expect(store.read()).toEqual({});
  });
});

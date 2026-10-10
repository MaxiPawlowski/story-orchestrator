const settings: Record<string, unknown> = {};
const saves = { count: 0 };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSettingsSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false, failed: false }),
  readServerExtensionSettings: async () => null,
  getContext: () => ({ extensionSettings: settings, saveSettingsDebounced: () => { saves.count += 1; } }),
}));

import { deltaFrom, overDefaults } from "./settingsDelta";
import { defaultGlobalSettings, getGlobalSettings, globalSettingsDelta, readGlobalSettings, setGlobalSettings, type GlobalSettings } from "./settingsStore";

const stored = () => (settings["story-orchestrator"] as Record<string, unknown> | undefined)?.settings;
const withDefaults = (edit: (defaults: GlobalSettings) => void): GlobalSettings => {
  const defaults = defaultGlobalSettings();
  edit(defaults);
  return defaults;
};

beforeEach(() => {
  delete settings["story-orchestrator"];
  saves.count = 0;
});

describe("v2.8 F15: install-wide settings persist only what the user set", () => {
  it("a write stores only the values that differ from the defaults", () => {
    setGlobalSettings({ extraction: { cadence: 5 }, sprites: { cardOverlay: false } });
    expect(stored()).toEqual({ extraction: { cadence: 5 }, sprites: { cardOverlay: false } });
    expect(getGlobalSettings().extraction.cadence).toBe(5);
    expect(getGlobalSettings().sprites.cardOverlay).toBe(false);
    expect(getGlobalSettings().judge.uses).toEqual(defaultGlobalSettings().judge.uses);
  });

  it("writing a value back to its default deletes it from the store", () => {
    setGlobalSettings({ talk: { enabled: false } });
    expect(stored()).toEqual({ talk: { enabled: false } });
    setGlobalSettings({ talk: { enabled: true } });
    expect(stored()).toEqual({});
  });

  it("a whole-section write (the judge uses) stores only the changed use", () => {
    const uses = { ...getGlobalSettings().judge.uses, director: false };
    setGlobalSettings({ judge: { uses } });
    expect(stored()).toEqual({ judge: { uses: { director: false } } });
  });

  it("a read never writes and never saves, on an empty root or a populated one", () => {
    getGlobalSettings();
    expect(stored()).toBeUndefined();
    settings["story-orchestrator"] = { settings: { spikes: { editReread: false } } };
    const before = JSON.stringify(settings);
    expect(getGlobalSettings().spikes.editReread).toBe(false);
    expect(JSON.stringify(settings)).toBe(before);
    expect(saves.count).toBe(0);
  });

  it("a default flip reaches an install that never touched the key", () => {
    const before = withDefaults((defaults) => { defaults.judge.uses.houseRules = false; defaults.sprites.onDemand = false; });
    const chosen = withDefaults((defaults) => { defaults.judge.uses.houseRules = false; defaults.sprites.onDemand = false; defaults.extraction.cadence = 5; });
    settings["story-orchestrator"] = { settings: globalSettingsDelta(chosen, before) };
    expect(stored()).toEqual({ extraction: { cadence: 5 } });
    const read = getGlobalSettings();
    expect(read.judge.uses.houseRules).toBe(true);
    expect(read.sprites.onDemand).toBe(true);
    expect(read.extraction.cadence).toBe(5);
  });

  it("control: the old full write-back pinned the stale default", () => {
    const before = withDefaults((defaults) => { defaults.judge.uses.houseRules = false; });
    settings["story-orchestrator"] = { settings: JSON.parse(JSON.stringify(before)) };
    expect(getGlobalSettings().judge.uses.houseRules).toBe(false);
  });

  it("a user-set value survives a default flip", () => {
    setGlobalSettings({ judge: { uses: { ...getGlobalSettings().judge.uses, loreExclusive: false } }, worldInfo: { gatingMode: "file" } });
    const flipped = withDefaults((defaults) => { defaults.judge.uses.loreExclusive = false; defaults.worldInfo.gatingMode = "file"; });
    const later = withDefaults((defaults) => { defaults.judge.uses.loreExclusive = true; defaults.worldInfo.gatingMode = "scan"; });
    expect(readGlobalSettings(stored(), flipped).judge.uses.loreExclusive).toBe(false);
    expect(readGlobalSettings(stored(), later).judge.uses.loreExclusive).toBe(false);
    expect(readGlobalSettings(stored(), later).worldInfo.gatingMode).toBe("file");
  });

  it("a sprite choice that leaves `enabled` at its default still reads as the user's choice", () => {
    setGlobalSettings({ sprites: { enabled: false, explicit: true } });
    expect(stored()).toEqual({ sprites: { explicit: true } });
    expect(getGlobalSettings().sprites).toMatchObject({ enabled: false, explicit: true });
  });
});

describe("overDefaults / deltaFrom", () => {
  it("merges plain objects recursively and replaces arrays and primitives", () => {
    expect(overDefaults({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] }, e: null })).toEqual({ a: { b: 1, c: [3] }, d: 1, e: null });
    expect(overDefaults({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(overDefaults({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });

  it("keeps only differences, and nothing for an equal value", () => {
    expect(deltaFrom({ a: { b: 1, c: [1] }, d: "x" }, { a: { b: 1, c: [1, 2] }, d: "x", e: {} })).toEqual({ a: { c: [1, 2] }, e: {} });
    expect(deltaFrom({ a: 1 }, { a: 1 })).toBeUndefined();
  });

  it("round-trips: reading a delta gives back the settings it was taken from", () => {
    const changed = withDefaults((defaults) => {
      defaults.help.openSections = [];
      defaults.display.inline.categories = { lore: false };
      defaults.extraction.profiles = { director: "fast" };
      defaults.memory.injectionDepths = { ...defaults.memory.injectionDepths, facts: 9 };
    });
    expect(readGlobalSettings(globalSettingsDelta(changed))).toEqual(readGlobalSettings(changed));
  });
});

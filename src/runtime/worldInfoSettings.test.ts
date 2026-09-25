jest.mock("@services/STAPI", () => ({
  getContext: () => ({ extensionSettings: {}, saveSettingsDebounced: () => {} }),
  settingsAreLoaded: () => false,
}));

import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsStore";

describe("worldInfo settings (v2.4 plan 05 T13 spike)", () => {
  it("defaults to the file path with an empty normalisation ledger, and no plan flips that", () => {
    expect(defaultGlobalSettings().worldInfo).toEqual({ gatingMode: "file", normalized: {} });
    expect(sanitizeGlobalSettings({}).worldInfo).toEqual({ gatingMode: "file", normalized: {} });
  });

  it("keeps an explicit scan mode and a clean ledger, and drops anything else", () => {
    expect(sanitizeGlobalSettings({ worldInfo: { gatingMode: "scan", normalized: { "SO-T13 Ruins": ["CP1", "CP1", "", 3], Empty: [], Junk: "x" } } }).worldInfo)
      .toEqual({ gatingMode: "scan", normalized: { "SO-T13 Ruins": ["CP1"] } });
    expect(sanitizeGlobalSettings({ worldInfo: { gatingMode: "SCAN" } }).worldInfo.gatingMode).toBe("file");
  });
});

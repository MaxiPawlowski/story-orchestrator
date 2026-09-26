jest.mock("@services/STAPI", () => ({
  getContext: () => ({ extensionSettings: {}, saveSettingsDebounced: () => {} }),
  settingsAreLoaded: () => false,
}));

import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsStore";

describe("worldInfo settings (v2.5 plan 01)", () => {
  it("defaults to the file path with an empty ledger and no provenance, and no plan flips that", () => {
    expect(defaultGlobalSettings().worldInfo).toEqual({ gatingMode: "file", normalized: {}, normalizedFrom: {}, scanMemory: false });
    expect(sanitizeGlobalSettings({}).worldInfo).toEqual({ gatingMode: "file", normalized: {}, normalizedFrom: {}, scanMemory: false });
  });

  it("keeps an explicit scan mode and a clean ledger, and drops anything else", () => {
    expect(sanitizeGlobalSettings({ worldInfo: { gatingMode: "scan", normalized: { Ruins: ["CP1", "CP1", "", 3], Empty: [], Junk: "x" } } }).worldInfo)
      .toEqual({ gatingMode: "scan", normalized: { Ruins: ["CP1"] }, normalizedFrom: {}, scanMemory: false });
    expect(sanitizeGlobalSettings({ worldInfo: { gatingMode: "SCAN" } }).worldInfo.gatingMode).toBe("file");
  });

  it("round-trips the provenance of each normalised entry (W1: a new key beside the unchanged ledger)", () => {
    const worldInfo = { gatingMode: "scan", normalized: { Ruins: ["CP1", "CP2"] }, normalizedFrom: { Ruins: [{ comment: "CP1", wasOn: true }, { comment: "CP2", wasOn: false }] }, scanMemory: false };
    const once = sanitizeGlobalSettings({ worldInfo }).worldInfo;
    expect(once).toEqual(worldInfo);
    expect(sanitizeGlobalSettings({ worldInfo: once }).worldInfo).toEqual(worldInfo);
  });

  it("drops a malformed provenance row, a duplicate comment, and a book with no rows", () => {
    const normalizedFrom = {
      Ruins: [{ comment: "CP1", wasOn: true }, { comment: "CP1", wasOn: false }, { comment: "", wasOn: true }, { comment: "CP3" }, "CP4", { comment: "CP5", wasOn: "yes" }],
      Empty: [],
      Junk: "x",
    };
    expect(sanitizeGlobalSettings({ worldInfo: { normalized: {}, normalizedFrom } }).worldInfo.normalizedFrom).toEqual({ Ruins: [{ comment: "CP1", wasOn: true }] });
  });

  it("L4: memory scanning is off by default and only an explicit true switches it on", () => {
    expect(defaultGlobalSettings().worldInfo.scanMemory).toBe(false);
    expect(sanitizeGlobalSettings({ worldInfo: { scanMemory: true } }).worldInfo.scanMemory).toBe(true);
    expect(sanitizeGlobalSettings({ worldInfo: { scanMemory: "yes" } }).worldInfo.scanMemory).toBe(false);
  });
});

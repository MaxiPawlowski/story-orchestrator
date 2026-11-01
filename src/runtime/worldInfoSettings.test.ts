jest.mock("@services/STAPI", () => ({
  getContext: () => ({ extensionSettings: {}, saveSettingsDebounced: () => {} }),
  settingsAreLoaded: () => false,
}));

import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsStore";

const G42 = { budgetEvidence: true, lexicalFallback: true, lexicalPrefilter: false, lexicalTiebreak: true, holdRound: true, preferKnown: true, loreLifetime: true, loreState: true,
  loreAliases: true };

describe("worldInfo settings (v2.5 plan 01)", () => {
  it("R7: defaults to per-chat (scan) gating with an empty ledger and no provenance", () => {
    expect(defaultGlobalSettings().worldInfo).toEqual({ gatingMode: "scan", normalized: {}, normalizedFrom: {}, scanMemory: true, keptGlobal: [], lateLore: true, lateLoreDepth: 4, lorePins: true, seededChance: true, ...G42 });
    expect(sanitizeGlobalSettings({}).worldInfo).toEqual({ gatingMode: "scan", normalized: {}, normalizedFrom: {}, scanMemory: true, keptGlobal: [], lateLore: true, lateLoreDepth: 4, lorePins: true, seededChance: true, ...G42 });
  });

  it("keeps an explicit scan mode and a clean ledger, and drops anything else", () => {
    expect(sanitizeGlobalSettings({ worldInfo: { gatingMode: "scan", normalized: { Ruins: ["CP1", "CP1", "", 3], Empty: [], Junk: "x" } } }).worldInfo)
      .toEqual({ gatingMode: "scan", normalized: { Ruins: ["CP1"] }, normalizedFrom: {}, scanMemory: true, keptGlobal: [], lateLore: true, lateLoreDepth: 4, lorePins: true, seededChance: true, ...G42 });
    expect(sanitizeGlobalSettings({ worldInfo: { gatingMode: "FILE" } }).worldInfo.gatingMode).toBe("scan");
  });

  it("F15: a stored file mode is the author's own choice, since only a write stores it", () => {
    expect(sanitizeGlobalSettings({ worldInfo: { gatingMode: "file" } }).worldInfo.gatingMode).toBe("file");
    expect(sanitizeGlobalSettings({ worldInfo: { gatingMode: "file", gatingChosen: true } }).worldInfo).not.toHaveProperty("gatingChosen");
  });

  it("round-trips the provenance of each normalised entry (W1: a new key beside the unchanged ledger)", () => {
    const worldInfo = { gatingMode: "scan", normalized: { Ruins: ["CP1", "CP2"] }, normalizedFrom: { Ruins: [{ comment: "CP1", wasOn: true }, { comment: "CP2", wasOn: false }] }, scanMemory: false, keptGlobal: [], lateLore: true, lateLoreDepth: 4, lorePins: true, seededChance: true, ...G42 };
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

  it("42a G: the lexical prefilter ships off (owner 2026-10-31); only an explicit true switches it on", () => {
    expect(defaultGlobalSettings().worldInfo.lexicalPrefilter).toBe(false);
    expect(sanitizeGlobalSettings({ worldInfo: { lexicalPrefilter: "yes" } }).worldInfo.lexicalPrefilter).toBe(false);
    expect(sanitizeGlobalSettings({ worldInfo: { lexicalPrefilter: true } }).worldInfo.lexicalPrefilter).toBe(true);
    expect([defaultGlobalSettings().worldInfo.lexicalFallback, defaultGlobalSettings().worldInfo.lexicalTiebreak]).toEqual([true, true]);
  });

  it("L4: memory scanning is on by default and an explicit false switches it off", () => {
    expect(defaultGlobalSettings().worldInfo.scanMemory).toBe(true);
    expect(sanitizeGlobalSettings({ worldInfo: { scanMemory: true } }).worldInfo.scanMemory).toBe(true);
    expect(sanitizeGlobalSettings({ worldInfo: { scanMemory: false } }).worldInfo.scanMemory).toBe(false);
    expect(sanitizeGlobalSettings({ worldInfo: { scanMemory: "yes" } }).worldInfo.scanMemory).toBe(true);
  });
});

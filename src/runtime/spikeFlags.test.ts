import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";

const ALL_ON = {
  swipeBackCache: true,
  sp6Complications: true,
  reasoningEffect: true,
  editReread: true,
};

describe("v2.5 plan 09 rule 2: every spike flag is install-wide, on by default (owner decision 2026-10-09)", () => {
  it("defaults every spike on", () => {
    expect(defaultGlobalSettings().spikes).toEqual(ALL_ON);
    expect(sanitizeGlobalSettings({}).spikes).toEqual(ALL_ON);
  });

  it("takes only a literal false, so a stray value never switches a spike off", () => {
    expect(sanitizeGlobalSettings({ spikes: { sp6Complications: false } }).spikes).toEqual({ ...ALL_ON, sp6Complications: false });
    expect(sanitizeGlobalSettings({ spikes: { swipeBackCache: false, sp6Complications: 0 } }).spikes).toEqual({ ...ALL_ON, swipeBackCache: false });
    expect(sanitizeGlobalSettings({ spikes: { sp6Complications: "no" } }).spikes).toEqual(ALL_ON);
    expect(sanitizeGlobalSettings({ spikes: "off" }).spikes).toEqual(ALL_ON);
  });

  it("v2.7 02 C1: the promoted story scenario has no flag, and a stored sp5Scenario value is dropped", () => {
    expect(sanitizeGlobalSettings({ spikes: { sp5Scenario: true } }).spikes).toEqual(ALL_ON);
    expect(Object.keys(defaultGlobalSettings().spikes)).not.toContain("sp5Scenario");
  });

  it("v2.7 02 C13: the promoted curator tiers have no flag, and a stored sp8CuratorTiers value is dropped", () => {
    expect(sanitizeGlobalSettings({ spikes: { sp8CuratorTiers: true } }).spikes).toEqual(ALL_ON);
    expect(Object.keys(defaultGlobalSettings().spikes)).not.toContain("sp8CuratorTiers");
  });
});

import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";

const ALL_OFF = {
  swipeBackCache: false,
  sp6Complications: false,
  sp8CuratorTiers: false,
  reasoningEffect: false,
};

describe("v2.5 plan 09 rule 2: every spike flag is install-wide and off by default", () => {
  it("defaults every spike off", () => {
    expect(defaultGlobalSettings().spikes).toEqual(ALL_OFF);
    expect(sanitizeGlobalSettings({}).spikes).toEqual(ALL_OFF);
  });

  it("takes only a literal true, so a stray value never switches a spike on", () => {
    expect(sanitizeGlobalSettings({ spikes: { sp6Complications: true } }).spikes).toEqual({ ...ALL_OFF, sp6Complications: true });
    expect(sanitizeGlobalSettings({ spikes: { sp8CuratorTiers: true, sp6Complications: 1 } }).spikes).toEqual({ ...ALL_OFF, sp8CuratorTiers: true });
    expect(sanitizeGlobalSettings({ spikes: { sp6Complications: "yes" } }).spikes).toEqual(ALL_OFF);
    expect(sanitizeGlobalSettings({ spikes: "on" }).spikes).toEqual(ALL_OFF);
  });

  it("v2.7 02 C1: the promoted story scenario has no flag, and a stored sp5Scenario value is dropped", () => {
    expect(sanitizeGlobalSettings({ spikes: { sp5Scenario: true } }).spikes).toEqual(ALL_OFF);
    expect(Object.keys(defaultGlobalSettings().spikes)).not.toContain("sp5Scenario");
  });
});

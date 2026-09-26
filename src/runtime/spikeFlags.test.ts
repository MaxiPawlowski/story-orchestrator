import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";

const ALL_OFF = {
  recommitEdit: false,
  swipeBackCache: false,
  witnessFilter: false,
  sp5Scenario: false,
  sp7Chance: false,
  sp6Complications: false,
  sp4AppendShortTerm: false,
  sp8CuratorTiers: false,
  sp8CuratorDigest: false,
};

describe("v2.5 plan 09 rule 2: every spike flag is install-wide and off by default", () => {
  it("defaults every spike off", () => {
    expect(defaultGlobalSettings().spikes).toEqual(ALL_OFF);
    expect(sanitizeGlobalSettings({}).spikes).toEqual(ALL_OFF);
  });

  it("takes only a literal true, so a stray value never switches a spike on", () => {
    expect(sanitizeGlobalSettings({ spikes: { sp4AppendShortTerm: true } }).spikes).toEqual({ ...ALL_OFF, sp4AppendShortTerm: true });
    expect(sanitizeGlobalSettings({ spikes: { sp8CuratorTiers: true, sp8CuratorDigest: 1 } }).spikes).toEqual({ ...ALL_OFF, sp8CuratorTiers: true });
    expect(sanitizeGlobalSettings({ spikes: { sp4AppendShortTerm: "yes" } }).spikes).toEqual(ALL_OFF);
    expect(sanitizeGlobalSettings({ spikes: "on" }).spikes).toEqual(ALL_OFF);
  });
});

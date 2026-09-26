import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";

describe("v2.5 plan 09 rule 2: every spike flag is install-wide and off by default", () => {
  it("defaults every spike off", () => {
    expect(defaultGlobalSettings().spikes).toEqual({ sp4AppendShortTerm: false });
    expect(sanitizeGlobalSettings({}).spikes).toEqual({ sp4AppendShortTerm: false });
  });

  it("takes only a literal true, so a stray value never switches a spike on", () => {
    expect(sanitizeGlobalSettings({ spikes: { sp4AppendShortTerm: true } }).spikes.sp4AppendShortTerm).toBe(true);
    expect(sanitizeGlobalSettings({ spikes: { sp4AppendShortTerm: "yes" } }).spikes.sp4AppendShortTerm).toBe(false);
    expect(sanitizeGlobalSettings({ spikes: "on" }).spikes.sp4AppendShortTerm).toBe(false);
  });
});

const settings: Record<string, unknown> = { "story-orchestrator": { settings: { extraction: { profileId: "profile-from-disk", cadence: 7, enabled: false } } } };

jest.mock("@services/STAPI", () => ({
  getContext: () => ({ extensionSettings: settings, saveSettingsDebounced: () => {} }),
  settingsAreLoaded: () => loadedFlag,
}));

let loadedFlag = false;

import { getGlobalSettings } from "./settingsStore";

describe("settings load seam (v2.3 plan 06 F2, v2.8 F15)", () => {
  it("does not write before ST has loaded the extension settings", () => {
    const before = JSON.stringify(settings["story-orchestrator"]);
    const read = getGlobalSettings();
    expect(read.extraction.profileId).toBe("profile-from-disk");
    expect(read.extraction.cadence).toBe(7);
    expect(JSON.stringify(settings["story-orchestrator"])).toBe(before);
  });

  it("does not write after the load either: the stored delta stays exactly as it was", () => {
    loadedFlag = true;
    const before = JSON.stringify(settings["story-orchestrator"]);
    const read = getGlobalSettings();
    expect(read.extraction.profileId).toBe("profile-from-disk");
    expect(read.judge.enabled).toBe(true);
    expect(JSON.stringify(settings["story-orchestrator"])).toBe(before);
  });
});

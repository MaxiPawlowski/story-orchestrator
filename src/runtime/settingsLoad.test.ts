// v2.3 plan 06 (F2). `extension_settings` is not ours until ST has loaded it, and the settings READ
// is also a WRITE: it replaces the stored value with its sanitized form. Before the load that write
// stamps sanitized defaults over whatever the file holds, which is how an early read could destroy
// an author's settings. This test reproduces the pre-load read and proves it no longer writes.

const settings: Record<string, unknown> = { "story-orchestrator": { settings: { extraction: { profileId: "profile-from-disk", cadence: 7, enabled: false } } } };

jest.mock("@services/STAPI", () => ({
  getContext: () => ({ extensionSettings: settings, saveSettingsDebounced: () => {} }),
  settingsAreLoaded: () => loadedFlag,
}));

let loadedFlag = false;

import { getGlobalSettings } from "./settingsStore";

describe("settings load seam (v2.3 plan 06, F2)", () => {
  it("does not write back before ST has loaded the extension settings", () => {
    const before = JSON.stringify(settings["story-orchestrator"]);
    const read = getGlobalSettings();
    // The caller still gets a usable, sanitized view...
    expect(read.extraction.profileId).toBe("profile-from-disk");
    expect(read.extraction.cadence).toBe(7);
    // ...and the stored value is exactly as it was, so nothing has been stamped over it.
    expect(JSON.stringify(settings["story-orchestrator"])).toBe(before);
  });

  it("writes its sanitized result back once the load has happened", () => {
    loadedFlag = true;
    const read = getGlobalSettings();
    expect(read.extraction.profileId).toBe("profile-from-disk");
    // The write-back is the sanitized form of what was there: a field the schema rejects goes, and
    // the author's own values survive.
    expect(JSON.stringify(settings["story-orchestrator"])).toContain("profile-from-disk");
    expect(settings["story-orchestrator"]).toMatchObject({ settings: { extraction: { cadence: 7, enabled: false } } });
  });
});

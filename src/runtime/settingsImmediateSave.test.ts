const settings: Record<string, unknown> = {};
const soon = jest.fn(() => ({ ok: true, queued: true }));
const debounced = jest.fn();

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  saveSettingsSoon: () => soon(),
  observeNextSettingsSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false, failed: false }),
  readServerExtensionSettings: async () => null,
  getContext: () => ({ extensionSettings: settings, saveSettingsDebounced: debounced }),
}));

import { setGlobalSettings } from "./settingsStore";

describe("install-wide settings save at once (B3)", () => {
  it("a write asks for an immediate save, so a reload inside ST's 1 s debounce cannot drop it", () => {
    setGlobalSettings({ talk: { enabled: false } });
    expect(soon).toHaveBeenCalledTimes(1);
    expect(debounced).not.toHaveBeenCalled();
  });
});

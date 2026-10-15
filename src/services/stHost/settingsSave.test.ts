const hostSave = jest.fn(async () => {});
const debounced = jest.fn();

jest.mock("./modules", () => ({ scriptModule: { saveSettings: () => hostSave() } }));
jest.mock("./context", () => ({ getContext: () => ({ saveSettingsDebounced: debounced }) }));

import { saveSettingsSoon } from "./settingsSave";

describe("saveSettingsSoon (B3)", () => {
  beforeEach(() => { jest.useFakeTimers(); hostSave.mockClear(); debounced.mockClear(); });
  afterEach(() => jest.useRealTimers());

  it("saves on the next tick through the host's own save, not its 1 s debounce, and folds a burst into one save", () => {
    expect(saveSettingsSoon()).toEqual({ ok: true, queued: true });
    expect(saveSettingsSoon()).toEqual({ ok: true, queued: false });
    expect(hostSave).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(hostSave).toHaveBeenCalledTimes(1);
    expect(debounced).not.toHaveBeenCalled();
    saveSettingsSoon();
    jest.advanceTimersByTime(0);
    expect(hostSave).toHaveBeenCalledTimes(2);
  });
});

/** @jest-environment jsdom */

import { getContext, getTextGenSettingNames, setSettingByName } from "@services/STAPI";
import { registerTextgenPresetUiBridge } from "./textgenPresetUiBridge";

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
  getTextGenSettingNames: jest.fn(() => ["temperature", "top_p", "samplers"]),
  setSettingByName: jest.fn(),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const getTextGenSettingNamesMock = getTextGenSettingNames as jest.MockedFunction<typeof getTextGenSettingNames>;
const setSettingByNameMock = setSettingByName as jest.MockedFunction<typeof setSettingByName>;

describe("registerTextgenPresetUiBridge", () => {
  let context: { textCompletionSettings: { preset: string } };

  beforeEach(() => {
    document.body.innerHTML = `
      <select id="settings_preset_textgenerationwebui">
        <option value="Story:story-1">Story:story-1</option>
      </select>
      <input id="temperature_textgenerationwebui" />
      <input id="top_p_textgenerationwebui" />
    `;
    getContextMock.mockReset();
    getTextGenSettingNamesMock.mockClear();
    setSettingByNameMock.mockClear();
    context = { textCompletionSettings: { preset: "" } };
    getContextMock.mockReturnValue(context as any);
    delete (globalThis as any).ST_applyTextgenPresetToUI;
  });

  it("registers a bridge that syncs non-ignored textgen controls", () => {
    registerTextgenPresetUiBridge();

    const bridge = (globalThis as any).ST_applyTextgenPresetToUI;
    expect(typeof bridge).toBe("function");

    bridge("Story:story-1", { temperature: 0.4, top_p: 0.7, samplers: ["ignored"] });

    expect(setSettingByNameMock).toHaveBeenCalledWith("temperature", 0.4, true);
    expect(setSettingByNameMock).toHaveBeenCalledWith("top_p", 0.7, true);
    expect(setSettingByNameMock).not.toHaveBeenCalledWith("samplers", ["ignored"], true);
    expect(context.textCompletionSettings.preset).toBe("Story:story-1");
    expect((document.getElementById("settings_preset_textgenerationwebui") as HTMLSelectElement).value).toBe("Story:story-1");
  });
});

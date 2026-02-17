/** @jest-environment jsdom */

import { PresetService } from "@services/PresetService";
import {
  BIAS_CACHE,
  displayLogitBias,
  getContext,
  setGenerationParamsFromPreset,
  tgPresetNames,
  tgPresetObjs,
} from "@services/STAPI";

jest.mock("@services/STAPI", () => {
  const names: string[] = [];
  const objs: any[] = [];
  return {
    setGenerationParamsFromPreset: jest.fn(),
    setSettingByName: jest.fn(),
    tgPresetObjs: objs,
    tgPresetNames: names,
    TG_SETTING_NAMES: ["temperature", "top_p"],
    BIAS_CACHE: new Map(),
    displayLogitBias: jest.fn(),
    getContext: jest.fn(),
  };
});

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const setGenerationParamsFromPresetMock = setGenerationParamsFromPreset as jest.MockedFunction<typeof setGenerationParamsFromPreset>;
const displayLogitBiasMock = displayLogitBias as jest.MockedFunction<typeof displayLogitBias>;

describe("PresetService", () => {
  beforeEach(() => {
    tgPresetNames.splice(0, tgPresetNames.length);
    tgPresetObjs.splice(0, tgPresetObjs.length);
    BIAS_CACHE.clear();
    getContextMock.mockReset();
    setGenerationParamsFromPresetMock.mockReset();
    displayLogitBiasMock.mockReset();
    document.body.innerHTML = `
      <select id="settings_preset_textgenerationwebui"></select>
      <input id="temperature_textgenerationwebui" />
      <input id="top_p_textgenerationwebui" />
    `;
  });

  it("applies role preset with fallback + checkpoint override priority", () => {
    tgPresetNames.push("fallback");
    tgPresetObjs.push({ temperature: 0.6, top_p: 0.7, logit_bias: [] });

    const emit = jest.fn();
    const saveSettingsDebounced = jest.fn();
    const context = {
      textCompletionSettings: { temperature: 1.1, top_p: 0.95, preset: "", logit_bias: [] },
      saveSettingsDebounced,
      eventTypes: { PRESET_CHANGED: "PRESET_CHANGED" },
      eventSource: { emit },
    };
    getContextMock.mockReturnValue(context as any);

    const uiBridge = jest.fn();
    (globalThis as any).ST_applyTextgenPresetToUI = uiBridge;

    const service = new PresetService({
      storyId: "story-1",
      storyTitle: "Story 1",
      base: { source: "current" },
      fallbackPreset: "fallback",
    });

    const merged = service.applyForRole("dm" as any, { temperature: 0.2 } as any, "CP1");

    expect(merged.temperature).toBe(0.2);
    expect(merged.top_p).toBe(0.7);
    expect(tgPresetNames).toContain("Story:story-1");
    expect(setGenerationParamsFromPresetMock).toHaveBeenCalled();
    expect(displayLogitBiasMock).toHaveBeenCalled();
    expect(saveSettingsDebounced).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("PRESET_CHANGED", {
      apiId: "textgenerationwebui",
      name: "Story:story-1",
    });
    expect(uiBridge).toHaveBeenCalled();
  });

  it("applies named base preset into runtime settings", () => {
    tgPresetNames.push("basePreset");
    tgPresetObjs.push({ temperature: 0.5, top_p: 0.8, logit_bias: [] });

    const context = {
      textCompletionSettings: { temperature: 1.0, top_p: 1.0, preset: "", logit_bias: [] },
      saveSettingsDebounced: jest.fn(),
      eventTypes: { PRESET_CHANGED: "PRESET_CHANGED" },
      eventSource: { emit: jest.fn() },
    };
    getContextMock.mockReturnValue(context as any);
    (globalThis as any).ST_applyTextgenPresetToUI = jest.fn();

    const service = new PresetService({
      storyId: "story-2",
      base: { source: "named", name: "basePreset" },
      fallbackPreset: null,
    });

    service.applyBasePreset();

    expect(context.textCompletionSettings.preset).toBe("Story:story-2");
    expect(context.textCompletionSettings.temperature).toBe(0.5);
    expect(context.textCompletionSettings.top_p).toBe(0.8);
  });
});

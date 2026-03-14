/** @jest-environment jsdom */

import { PresetService } from "@services/PresetService";
import {
  applyTextGenPresetRuntime,
  findTextGenPreset,
  getTextGenSettingNames,
  tgPresetNames,
  tgPresetObjs,
  upsertTextGenPreset,
} from "@services/stHost/presets";
import { getContext } from "@services/stHost/context";

jest.mock("@services/stHost/context", () => ({
  getContext: jest.fn(),
}));

jest.mock("@services/stHost/presets", () => {
  const names: string[] = [];
  const objs: any[] = [];
  return {
    applyTextGenPresetRuntime: jest.fn(() => true),
    findTextGenPreset: jest.fn((name: string) => {
      const index = names.indexOf(name);
      return index === -1 ? null : objs[index];
    }),
    getTextGenSettingNames: jest.fn(() => ["temperature", "top_p"]),
    tgPresetObjs: objs,
    tgPresetNames: names,
    upsertTextGenPreset: jest.fn((name: string, preset: any) => {
      const index = names.indexOf(name);
      if (index === -1) {
        names.push(name);
        objs.push(preset);
        return;
      }
      objs[index] = preset;
    }),
  };
});

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const applyTextGenPresetRuntimeMock = applyTextGenPresetRuntime as jest.MockedFunction<typeof applyTextGenPresetRuntime>;
const getTextGenSettingNamesMock = getTextGenSettingNames as jest.MockedFunction<typeof getTextGenSettingNames>;
const upsertTextGenPresetMock = upsertTextGenPreset as jest.MockedFunction<typeof upsertTextGenPreset>;
const findTextGenPresetMock = findTextGenPreset as jest.MockedFunction<typeof findTextGenPreset>;

describe("PresetService", () => {
  beforeEach(() => {
    tgPresetNames.splice(0, tgPresetNames.length);
    tgPresetObjs.splice(0, tgPresetObjs.length);
    getContextMock.mockReset();
    applyTextGenPresetRuntimeMock.mockClear();
    getTextGenSettingNamesMock.mockClear();
    upsertTextGenPresetMock.mockClear();
    findTextGenPresetMock.mockClear();
    document.body.innerHTML = `
      <select id="settings_preset_textgenerationwebui"></select>
      <input id="temperature_textgenerationwebui" />
      <input id="top_p_textgenerationwebui" />
    `;
  });

  it("applies role preset with fallback + checkpoint override priority", () => {
    tgPresetNames.push("fallback");
    tgPresetObjs.push({ temperature: 0.6, top_p: 0.7, logit_bias: [] });

    const context = {
      textCompletionSettings: { temperature: 1.1, top_p: 0.95, preset: "", logit_bias: [] },
    };
    getContextMock.mockReturnValue(context as any);

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
    expect(upsertTextGenPresetMock).toHaveBeenCalledWith("Story:story-1", expect.objectContaining({ temperature: 0.2, top_p: 0.7 }));
    expect(applyTextGenPresetRuntimeMock).toHaveBeenCalledWith(
      "Story:story-1",
      expect.objectContaining({ temperature: 0.2, top_p: 0.7 }),
      expect.stringContaining("[dm]"),
    );
  });

  it("applies named base preset into runtime settings", () => {
    tgPresetNames.push("basePreset");
    tgPresetObjs.push({ temperature: 0.5, top_p: 0.8, logit_bias: [] });

    const context = {
      textCompletionSettings: { temperature: 1.0, top_p: 1.0, preset: "", logit_bias: [] },
    };
    getContextMock.mockReturnValue(context as any);

    const service = new PresetService({
      storyId: "story-2",
      base: { source: "named", name: "basePreset" },
      fallbackPreset: null,
    });

    service.applyBasePreset();

    expect(context.textCompletionSettings.preset).toBe("Story:story-2");
    expect(applyTextGenPresetRuntimeMock).toHaveBeenCalledWith(
      "Story:story-2",
      expect.objectContaining({ temperature: 0.5, top_p: 0.8 }),
      undefined,
    );
  });
});

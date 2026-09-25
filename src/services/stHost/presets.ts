import { logitBiasModule, scriptModule, textgenSettingsModule } from "./modules";

export type TextGenPreset = Record<string, unknown>;

export const BIAS_CACHE = logitBiasModule.BIAS_CACHE;
export const displayLogitBias = logitBiasModule.displayLogitBias;
export const tgPresetObjs = textgenSettingsModule.textgenerationwebui_presets;
export const tgPresetNames = textgenSettingsModule.textgenerationwebui_preset_names;
export const TG_SETTING_NAMES = textgenSettingsModule.setting_names;
export const setSettingByName = textgenSettingsModule.setSettingByName;
export const setGenerationParamsFromPreset = scriptModule.setGenerationParamsFromPreset;

export function getTextGenSettingNames(): string[] {
  return [...TG_SETTING_NAMES];
}

export function findTextGenPreset(name: string): TextGenPreset | null {
  const index = tgPresetNames.indexOf(name);
  return index === -1 ? null : tgPresetObjs[index];
}

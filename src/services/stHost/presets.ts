import { cloneStructured } from "@utils/dataHelpers";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { getContext } from "./context";
import type { HostTextCompletionSettings } from "./hostTypes";
import { logitBiasModule, scriptModule, textgenSettingsModule } from "./modules";

const TEXTGEN_BIAS_KEY = "#textgenerationwebui_api-settings";
const TEXTGEN_PRESET_SELECT_ID = "settings_preset_textgenerationwebui";

export type TextGenPreset = Record<string, unknown>;
type MutableTextCompletionSettings = HostTextCompletionSettings;

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

// v2.3 plan 06. What the active backend can take. The text-completion module is the ONE place a
// preset's sampler stack means anything: every other API (chat completion included) has its own
// settings object, so the generic UI action this used to run "succeeded" without reaching the model
// at all — the review's Artemis setup, and this install's llama.cpp OpenAI-compatible profile.
export type PresetBackend = "textgenerationwebui" | "other";

export const presetBackend = (): PresetBackend => {
  const api = String(getContext().mainApi ?? "").trim().toLowerCase();
  return api === "textgenerationwebui" ? "textgenerationwebui" : "other";
};

export const PRESET_UNSUPPORTED_REASON = "preset effects apply on Text Completion backends only; this connection uses another API";

/** The sampler stack this backend is running, or null when it has no such stack to read. */
export function readAppliedPreset(): { name: string; temperature: number | null; top_p: number | null } | null {
  if (presetBackend() !== "textgenerationwebui") return null;
  const settings = getContext().textCompletionSettings as Record<string, unknown>;
  return {
    name: typeof settings.preset === "string" ? settings.preset : "",
    temperature: typeof settings.temp === "number" ? settings.temp : null,
    top_p: typeof settings.top_p === "number" ? settings.top_p : null,
  };
}

export function applyPreset(name: string, presetObj: TextGenPreset, displayLabel?: string): WriteResult<{ name: string }> {
  if (presetBackend() !== "textgenerationwebui") return couldNot(PRESET_UNSUPPORTED_REASON);
  applyTextGenPresetRuntime(name, presetObj, displayLabel);
  return wrote({ name });
}

function ensureTextGenPresetOption(name: string) {
  const select = document.getElementById(TEXTGEN_PRESET_SELECT_ID) as HTMLSelectElement | null;
  if (!select) return;
  for (let index = 0; index < select.options.length; index += 1) {
    if (select.options[index].value === name) return;
  }
  const option = document.createElement("option");
  option.value = name;
  option.innerText = name;
  select.appendChild(option);
}

export function applyTextGenPresetRuntime(name: string, presetObj: TextGenPreset, displayLabel?: string) {
  const { saveSettingsDebounced, textCompletionSettings, eventTypes, eventSource } = getContext();
  const settings = textCompletionSettings as MutableTextCompletionSettings;
  for (const key of TG_SETTING_NAMES) {
    if (Object.prototype.hasOwnProperty.call(presetObj, key)) {
      settings[key] = cloneStructured(presetObj[key]);
    }
  }

  textCompletionSettings.preset = name;
  setGenerationParamsFromPreset(presetObj);
  BIAS_CACHE.delete(TEXTGEN_BIAS_KEY);
  const logitBias = (presetObj.logit_bias && typeof presetObj.logit_bias === "object") ? presetObj.logit_bias : {};
  displayLogitBias(logitBias, TEXTGEN_BIAS_KEY);
  saveSettingsDebounced();

  ensureTextGenPresetOption(name);
  const select = document.getElementById(TEXTGEN_PRESET_SELECT_ID) as HTMLSelectElement | null;
  if (select) {
    const option = Array.from(select.options).find((entry) => entry.value === name);
    if (option) option.textContent = displayLabel ?? name;
    select.value = name;
  }

  try {
    eventSource.emit(eventTypes.PRESET_CHANGED, {
      apiId: "textgenerationwebui",
      name,
    });
  } catch (err) {
    console.error("[Story - STAPI] error emitting PRESET_CHANGED", err);
  }
}

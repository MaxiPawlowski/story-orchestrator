import { UI_SYNC_MAX_ATTEMPTS, UI_SYNC_RETRY_DELAY_MS } from "@constants/defaults";
import { getContext, getTextGenSettingNames, setSettingByName } from "@services/STAPI";

const IGNORED_KEYS = new Set([
  "json_schema",
  "sampler_order",
  "sampler_priority",
  "samplers",
  "samplers_priorities",
  "extensions",
]);

const applySettingWithRetry = (key: string, value: unknown, attempt = 0) => {
  if (typeof setSettingByName !== "function") {
    console.warn("[Story - ST UI Bridge] setSettingByName not available");
    return;
  }

  let lastError: unknown | null = null;
  try {
    setSettingByName(key, value, true);
  } catch (error) {
    lastError = error;
  }

  const inputId = `${key}_textgenerationwebui`;
  const sliderId = `${key}_textgenerationwebui_zenslider`;
  const hasTarget = Boolean(document.getElementById(inputId) || document.getElementById(sliderId));

  if (hasTarget && lastError == null) {
    return;
  }

  if (attempt >= UI_SYNC_MAX_ATTEMPTS) {
    if (lastError != null) {
      console.warn(`[Story - ST UI Bridge] Skipped UI sync for ${key} after ${attempt + 1} attempts`, lastError);
    } else if (!hasTarget) {
      console.warn(`[Story - ST UI Bridge] Gave up waiting for UI controls for ${key}`);
    }
    return;
  }

  setTimeout(() => applySettingWithRetry(key, value, attempt + 1), UI_SYNC_RETRY_DELAY_MS);
};

export const registerTextgenPresetUiBridge = () => {
  if (typeof globalThis === "undefined") return;

  globalThis.ST_applyTextgenPresetToUI = (name: string, presetObj: Record<string, unknown>) => {
    try {
      const { textCompletionSettings } = getContext();
      for (const key of getTextGenSettingNames()) {
        if (!IGNORED_KEYS.has(key) && Object.prototype.hasOwnProperty.call(presetObj, key)) {
          applySettingWithRetry(key, presetObj[key]);
        }
      }
      textCompletionSettings.preset = name;
      const select = document.getElementById("settings_preset_textgenerationwebui") as HTMLSelectElement | null;
      if (select) {
        select.value = name;
      }
    } catch (err) {
      console.warn("[Story - ST UI Bridge] Failed to apply preset to UI", err);
    }
  };
};

import { cloneStructured } from "@utils/dataHelpers";
import type { TextGenPreset } from "@services/stHost/presets";
import type { PresetOverrides } from "@utils/story-schema";

type ComposePresetObjectOptions = {
  base: TextGenPreset;
  fallback?: TextGenPreset | null;
  checkpointOverride?: PresetOverrides;
  settingNames: readonly string[];
};

export const clonePresetFields = (
  source: TextGenPreset | null | undefined,
  settingNames: readonly string[],
  includeAllKnownKeys = false,
): TextGenPreset => {
  const out: TextGenPreset = {};
  const target: TextGenPreset = source ?? {};

  for (const key of settingNames) {
    if (includeAllKnownKeys || Object.prototype.hasOwnProperty.call(target, key)) {
      out[key] = cloneStructured(target[key]);
    }
  }

  if (Array.isArray(target.logit_bias)) {
    out.logit_bias = cloneStructured(target.logit_bias);
  }

  return out;
};

export const composePresetObject = ({
  base,
  fallback,
  checkpointOverride,
  settingNames,
}: ComposePresetObjectOptions): TextGenPreset => {
  const override = checkpointOverride ?? {};
  let merged: TextGenPreset = { ...base };

  if (fallback) {
    for (const key of Object.keys(fallback)) {
      if (!(key in override)) {
        merged[key] = fallback[key];
      }
    }
  }

  merged = { ...merged, ...override };

  if (!Array.isArray(merged.logit_bias)) {
    merged.logit_bias = Array.isArray(base.logit_bias) ? base.logit_bias : [];
  }

  return clonePresetFields(merged, settingNames, false);
};

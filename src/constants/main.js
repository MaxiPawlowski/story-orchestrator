import { extension_settings } from "../services/SillyTavernAPI.js";
import { defaultCommonSettings, defaultExcludedCharacterSettings, defaultThinkingPromptSettings } from "./thinking.js";

export const extensionName = "story-driver";
export const extensionFolder = `scripts/extensions/third-party/${extensionName}`;
export const settings = extension_settings[extensionName];

extension_settings[extensionName] = extension_settings[extensionName] || {};

extension_settings[extensionName] = {
  ...defaultCommonSettings,
  ...defaultThinkingPromptSettings,
  ...defaultExcludedCharacterSettings,
  // ...extension_settings[extensionName],
};


function importSTModule<T>(path: string): Promise<T> {
  return import(/* webpackIgnore: true */ path);
}

export type ScriptHostModule = typeof import("../../../../../../../script.js");
export type ExtensionsHostModule = typeof import("../../../../../../../scripts/extensions.js");
export type MacrosHostModule = typeof import("../../../../../../../scripts/macros.js");
export type WorldInfoHostModule = typeof import("../../../../../../../scripts/world-info.js");
export type TextgenSettingsHostModule = typeof import("../../../../../../../scripts/textgen-settings.js");
export type LogitBiasHostModule = typeof import("../../../../../../../scripts/logit-bias.js");
export type RossModsHostModule = typeof import("../../../../../../../scripts/RossAscends-mods.js");
export type GroupChatsHostModule = typeof import("../../../../../../../scripts/group-chats.js");
export type ExtensionsSharedHostModule = typeof import("../../../../../../../scripts/extensions/shared.js");
export type TokenizersHostModule = typeof import("../../../../../../../scripts/tokenizers.js");
export type PopupHostModule = typeof import("../../../../../../../scripts/popup.js");

export const scriptModule = await importSTModule<ScriptHostModule>("/script.js");
export const extensionsModule = await importSTModule<ExtensionsHostModule>("/scripts/extensions.js");
export const macrosModule = await importSTModule<MacrosHostModule>("/scripts/macros.js");
export const worldInfoModule = await importSTModule<WorldInfoHostModule>("/scripts/world-info.js");
export const textgenSettingsModule = await importSTModule<TextgenSettingsHostModule>("/scripts/textgen-settings.js");
export const logitBiasModule = await importSTModule<LogitBiasHostModule>("/scripts/logit-bias.js");
export const rossModsModule = await importSTModule<RossModsHostModule>("/scripts/RossAscends-mods.js");
export const groupChatsModule = await importSTModule<GroupChatsHostModule>("/scripts/group-chats.js");
export const extensionsSharedModule = await importSTModule<ExtensionsSharedHostModule>("/scripts/extensions/shared.js");
export const tokenizersModule = await importSTModule<TokenizersHostModule>("/scripts/tokenizers.js");
export const popupModule = await importSTModule<PopupHostModule>("/scripts/popup.js");

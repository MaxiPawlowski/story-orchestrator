import type { ExtensionsSharedHostModule, GroupChatsHostModule, LogitBiasHostModule, RossModsHostModule, ScriptHostModule, TextgenSettingsHostModule, WorldInfoHostModule } from "./hostTypes";

export type { ExtensionsSharedHostModule, GroupChatsHostModule, LogitBiasHostModule, RossModsHostModule, ScriptHostModule, TextgenSettingsHostModule, WorldInfoHostModule } from "./hostTypes";

export function importSTModule<T>(path: string): Promise<T> {
  return import(/* webpackIgnore: true */ path);
}

export const scriptModule = await importSTModule<ScriptHostModule>("/script.js");
export const worldInfoModule = await importSTModule<WorldInfoHostModule>("/scripts/world-info.js");
export const textgenSettingsModule = await importSTModule<TextgenSettingsHostModule>("/scripts/textgen-settings.js");
export const logitBiasModule = await importSTModule<LogitBiasHostModule>("/scripts/logit-bias.js");
export const rossModsModule = await importSTModule<RossModsHostModule>("/scripts/RossAscends-mods.js");
export const groupChatsModule = await importSTModule<GroupChatsHostModule>("/scripts/group-chats.js");
export const extensionsSharedModule = await importSTModule<ExtensionsSharedHostModule>("/scripts/extensions/shared.js");

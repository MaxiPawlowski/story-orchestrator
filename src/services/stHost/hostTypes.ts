export interface HostCharacter {
  name?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface HostGroup {
  id: string;
  members: string[];
  disabled_members: string[];
  [key: string]: unknown;
}

export interface HostWorldInfoEntry {
  uid?: number;
  comment?: string;
  disable?: boolean;
  [key: string]: unknown;
}

export interface HostSlashCommand {
  aliases?: string[];
  helpString?: string;
  [key: string]: unknown;
}

export interface HostSlashCommandResult {
  isError?: boolean;
  errorMessage?: string;
  [key: string]: unknown;
}

export type HostTextCompletionSettings = { preset?: string } & Record<string, unknown>;

export type HostWorldInfoSettings = { world_info?: { globalSelect?: string[] } } & Record<string, unknown>;

export interface SillyTavernContext {
  chat: unknown[];
  chatMetadata: Record<string, unknown>;
  saveMetadata?: (...args: unknown[]) => Promise<void> | void;
  saveSettingsDebounced: () => void;
  extensionSettings: ExtensionSettingsMap;
  eventSource: SillyTavernEventSource;
  eventTypes: { PRESET_CHANGED: string } & Record<string, string | undefined>;
  textCompletionSettings: HostTextCompletionSettings;
  executeSlashCommandsWithOptions: (command: string, options?: { handleParserErrors?: boolean; handleExecutionErrors?: boolean }) => Promise<HostSlashCommandResult | undefined>;
  loadWorldInfo: (name: string) => Promise<unknown>;
  name1: string;
  groupId: string | null | undefined;
  groups: HostGroup[];
  characters: HostCharacter[];
  worldInfo?: Record<string, HostWorldInfoEntry>;
  SlashCommandParser?: { commands?: Record<string, HostSlashCommand> };
  [key: string]: unknown;
}

export interface ScriptHostModule {
  setGenerationParamsFromPreset: (preset: Record<string, unknown>) => void;
  isGenerating: () => boolean;
  [key: string]: unknown;
}

export interface WorldInfoHostModule {
  getWorldInfoSettings: () => HostWorldInfoSettings;
  createNewWorldInfo: (worldName: string, options?: { interactive?: boolean }) => Promise<unknown>;
  createWorldInfoEntry: (name: string, data: unknown) => unknown;
  saveWorldInfo: (name: string, data: unknown, immediately?: boolean) => Promise<unknown>;
  [key: string]: unknown;
}

export interface TextgenSettingsHostModule {
  textgenerationwebui_presets: Array<Record<string, unknown>>;
  textgenerationwebui_preset_names: string[];
  setting_names: readonly string[];
  setSettingByName: (setting: string, value: unknown, trigger?: boolean) => void;
  [key: string]: unknown;
}

export interface LogitBiasHostModule {
  BIAS_CACHE: Map<string, unknown>;
  displayLogitBias: (logitBias: object, containerSelector: string) => void;
  [key: string]: unknown;
}

export interface RossModsHostModule {
  getMessageTimeStamp: (timestamp?: number | string | Date) => string;
  [key: string]: unknown;
}

export interface GroupChatsHostModule {
  editGroup: (id: string, immediately: boolean, reload?: boolean) => Promise<void>;
  [key: string]: unknown;
}

export interface ExtensionsSharedHostModule {
  ConnectionManagerRequestService: {
    getSupportedProfiles: () => Array<Record<string, unknown>>;
    sendRequest: (profileId: string, prompt: string | Array<{ role: string; content: string }>, maxTokens: number, custom?: Record<string, unknown>, overridePayload?: Record<string, unknown>) => Promise<unknown>;
  };
  [key: string]: unknown;
}

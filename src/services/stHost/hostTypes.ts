export interface HostCharacter {
  name?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface HostGroup {
  id: string;
  members: string[];
  disabled_members: string[];
  // The group's chat file ids (group-chats.js:2248/2286). `deleteGroupChat` splices the id out BEFORE
  // its request, so absence here is not proof the file is gone (v2.4 02-H11).
  chats?: string[];
  [key: string]: unknown;
}

export interface HostWorldInfoEntry {
  uid?: number;
  comment?: string;
  disable?: boolean;
  [key: string]: unknown;
}

export interface HostScannableEntry extends HostWorldInfoEntry {
  world: string;
  uid: number;
  content: string;
  constant?: boolean;
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
  executeSlashCommandsWithOptions: (command: string, options?: { handleParserErrors?: boolean; handleExecutionErrors?: boolean; parserFlags?: Record<number, boolean> }) => Promise<HostSlashCommandResult | undefined>;
  loadWorldInfo: (name: string) => Promise<unknown>;
  name1: string;
  characterId?: number | string;
  groupId: string | null | undefined;
  // The open chat file's id: a group's chat_id, or the character's chat (st-context.js:125).
  chatId?: string | null;
  // v2.2 plan 04: `main_api` and `oai_settings` (st-context.js:200, :227), read for Generate()'s
  // `send_if_empty` branch (script.js:4455).
  mainApi?: string;
  chatCompletionSettings?: { send_if_empty?: string };
  groups: HostGroup[];
  characters: HostCharacter[];
  worldInfo?: Record<string, HostWorldInfoEntry>;
  powerUserSettings?: { personas?: Record<string, string> };
  SlashCommandParser?: { commands?: Record<string, HostSlashCommand> };
  // Provisioning seam (v2.1 plan 06): st-context.js:129 / :230 / :237. `getCharacters` is ST's
  // reload, not a getter — it refreshes both the character and the group caches (script.js:1326).
  getRequestHeaders?: (options?: { omitContentType?: boolean }) => Record<string, string>;
  getCharacters?: () => Promise<void>;
  humanizedDateTime?: () => string;
  // Every lorebook that exists, not only the active ones (st-context.js:284).
  getWorldInfoNames?: () => string[];
  // v2.4 03-H15: `CONNECT_API_MAP[api].selected` is `openai` (CC) or `textgenerationwebui` (TC) (st-context.js:285).
  CONNECT_API_MAP?: Record<string, { selected?: string } | undefined>;
  // v2.4 03-H6: the reply text ST's extracted path reads (script.js:6276, st-context.js:287).
  extractMessageFromData?: (data: unknown, activeApi?: string | null) => string;
  // v2.4 03-H17: the instruct template a TC profile names (st-context.js:288, preset-manager.js:757).
  getPresetManager?: (apiId?: string) => { getCompletionPresetByName: (name?: string) => Record<string, unknown> | undefined } | null | undefined;
  [key: string]: unknown;
}

export interface ScriptHostModule {
  setGenerationParamsFromPreset: (preset: Record<string, unknown>) => void;
  isGenerating: () => boolean;
  doNavbarIconClick: (this: Element) => Promise<void>;
  // script.js:405 — the name ST gives its own group `/sd` posts and tool-call rows (v2.4 01-H11).
  systemUserName: string;
  [key: string]: unknown;
}

// backgrounds.js:108 — a live `export let`, so reading `.name` always gives the active background.
export interface BackgroundsHostModule {
  background_settings: { name?: string; url?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorldInfoHostModule {
  getWorldInfoSettings: () => HostWorldInfoSettings;
  // The live list of globally active books. `world_info.globalSelect` is only a mirror of it, and
  // the mirror is written inside a *debounced* save (world-info.js:83), so this is the array to read.
  selected_world_info: string[];
  // The chat's own lorebook slot: `chat_metadata[METADATA_KEY]`, scanned for that chat only
  // (world-info.js:94, getChatLore at :4544).
  METADATA_KEY: string;
  // Re-reads `world_names` from the server and rebuilds both pickers (world-info.js:2061).
  updateWorldInfoList: () => Promise<void>;
  // `loadWorldInfo`'s cache (world-info.js:882, a Map). It also keeps the dummy `{entries:{}}` a
  // missing name returns, and `importWorldInfo` never evicts it.
  worldInfoCache: { delete: (name: string) => boolean };
  createNewWorldInfo: (worldName: string, options?: { interactive?: boolean }) => Promise<boolean>;
  createWorldInfoEntry: (name: string, data: unknown) => unknown;
  saveWorldInfo: (name: string, data: unknown, immediately?: boolean) => Promise<unknown>;
  // world-info.js:4346-4393: false for an unlisted name or a refused request; on success it evicts the
  // cache, unselects the book and refreshes `world_names` (v2.4 02-H13).
  deleteWorldInfo: (name: string) => Promise<boolean>;
  // v2.2 plan 04: every entry of every active source (global, character, chat, persona), stamped
  // with `world`, decorators parsed and hashed, structured-cloned (world-info.js:4590). It emits
  // WORLDINFO_ENTRIES_LOADED on the way (:4603).
  getSortedEntries: () => Promise<HostScannableEntry[]>;
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

// v2.4 03-H1: `custom` is destructured at shared.js:424 and `signal` reaches both services' `fetch`
// (CC :463, TC :483). `extractData: false` returns the raw reply JSON (03-H6).
export interface HostModelRequestCustom {
  extractData?: boolean;
  includePreset?: boolean;
  includeInstruct?: boolean;
  stream?: boolean;
  signal?: AbortSignal | null;
}

export interface ExtensionsSharedHostModule {
  ConnectionManagerRequestService: {
    getSupportedProfiles: () => Array<Record<string, unknown>>;
    sendRequest: (profileId: string, prompt: string | Array<{ role: string; content: string }>, maxTokens: number, custom?: HostModelRequestCustom, overridePayload?: Record<string, unknown>) => Promise<unknown>;
  };
  [key: string]: unknown;
}

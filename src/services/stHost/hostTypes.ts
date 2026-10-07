export interface HostCharacter {
  name?: string;
  avatar?: string;
  // The card's bound lorebook (world-info.js:4481).
  data?: { extensions?: { world?: unknown } };
  [key: string]: unknown;
}

export interface HostGroup {
  id: string;
  members: string[];
  disabled_members: string[];
  // The group's chat file ids (group-chats.js:2248/2286). `deleteGroupChat` splices the id out BEFORE
  // its request, so absence here is not proof the file is gone.
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

// The four per-call arrays `getSortedEntries` hands to WORLDINFO_ENTRIES_LOADED before
// it sorts, hashes and clones them. Each element is already a copy (`{uid, world, ...rest}` over a
// cloned book), so a listener's `disable` write is scan-local.
export interface HostEntriesLoaded {
  globalLore: HostScannableEntry[];
  characterLore: HostScannableEntry[];
  chatLore: HostScannableEntry[];
  personaLore: HostScannableEntry[];
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

// charLore: extra character books keyed by avatar file name without its extension (world-info.js:4488-4491).
export type HostWorldInfoSettings = { world_info?: { globalSelect?: string[]; charLore?: Array<{ name?: unknown; extraBooks?: unknown }> } } & Record<string, unknown>;

export interface SillyTavernContext {
  chat: unknown[];
  chatMetadata: Record<string, unknown>;
  saveMetadata?: (...args: unknown[]) => Promise<void> | void;
  saveSettingsDebounced: () => void;
  extensionSettings: ExtensionSettingsMap;
  eventSource: SillyTavernEventSource;
  eventTypes: { PRESET_CHANGED: string } & Record<string, string | undefined>;
  textCompletionSettings: HostTextCompletionSettings;
  executeSlashCommandsWithOptions: (
    command: string,
    options?: { handleParserErrors?: boolean; handleExecutionErrors?: boolean; parserFlags?: Record<number, boolean> },
  ) => Promise<HostSlashCommandResult | undefined>;
  loadWorldInfo: (name: string) => Promise<unknown>;
  name1: string;
  characterId?: number | string;
  groupId: string | null | undefined;
  // The open chat file's id: a group's chat_id, or the character's chat (st-context.js:125).
  chatId?: string | null;
  // `main_api` and `oai_settings` (st-context.js:200, :227), read for Generate()'s
  // `send_if_empty` branch (script.js:4455).
  mainApi?: string;
  // `custom_include_body` (openai.js:476) is what a preset without the key falls back to (custom-request.js:588-593).
  chatCompletionSettings?: { send_if_empty?: string; custom_include_body?: string };
  substituteParams?: (text: string) => string;
  groups: HostGroup[];
  characters: HostCharacter[];
  worldInfo?: Record<string, HostWorldInfoEntry>;
  // persona_description_lorebook: the persona's own book (world-info.js:4566); reasoning: the reasoning template, prefix/suffix (power-user.js:274-281);
  // persona_description: the selected persona's description, copied in on selection (power-user.js:290, personas.js:897-945).
  powerUserSettings?: { personas?: Record<string, string>; persona_description?: string; persona_description_lorebook?: unknown; reasoning?: unknown; tokenizer?: number };
  // `online_status` (st-context.js:133): the connected model's name, or "no_connection"; with power_user.tokenizer it picks the tokenizer getTokenCountAsync uses (tokenizers.js:285-335).
  onlineStatus?: string;
  SlashCommandParser?: { commands?: Record<string, HostSlashCommand> };
  // Exported on every supported host (st-context.js:98 import, :169 export, ST 1.18.0).
  SlashCommandEnumValue: new (value: string, description?: string) => unknown;
  // Provisioning seam: st-context.js:129 / :230 / :237. `getCharacters` is ST's
  // reload, not a getter — it refreshes both the character and the group caches (script.js:1326).
  getRequestHeaders?: (options?: { omitContentType?: boolean }) => Record<string, string>;
  getCharacters?: () => Promise<void>;
  humanizedDateTime?: () => string;
  // Every lorebook that exists, not only the active ones (st-context.js:284).
  getWorldInfoNames?: () => string[];
  // A CM profile's `api` -> `{selected}` (slash-commands.js:142, st-context.js:285), and the
  // preset manager for that API (st-context.js:288, preset-manager.js:83 — null for an unknown API).
  CONNECT_API_MAP?: Record<string, HostConnectApiMap | undefined>;
  getPresetManager?: (apiId?: string) => HostPresetManager | null;
  // The reply text ST's extracted path reads (script.js:6276, st-context.js:287).
  extractMessageFromData?: (data: unknown, activeApi?: string | null) => string;
  // Every extension prompt ST holds, ours and every other extension's (st-context.js:152).
  extensionPrompts?: Record<string, HostExtensionPrompt | undefined>;
  // The main API's tokenizer; on BEST_MATCH + textgen it is a backend call (tokenizers.js:443).
  getTokenCountAsync?: (text: string, padding?: number) => Promise<number>;
  // Re-renders one message from its chat row, text and reasoning (script.js:2033, st-context.js:238).
  updateMessageBlock?: (messageId: number, message: unknown) => void;
  // Opens a chat the group lists; silent for any other id (group-chats.js:2195-2210, st-context.js:157).
  openGroupChat?: (groupId: string, chatId: string) => Promise<void>;
  [key: string]: unknown;
}

// Script.js:8926-8935. `position` NONE -1 / IN_PROMPT 0 / IN_CHAT 1 / BEFORE_PROMPT 2; `filter`
// is a function ST awaits at assembly (a false answer skips the block) or null.
export interface HostExtensionPrompt {
  value?: unknown;
  position?: unknown;
  depth?: unknown;
  scan?: unknown;
  role?: unknown;
  filter?: unknown;
}

export interface HostConnectApiMap {
  selected: string;
  type?: string | null;
  source?: string | null;
  [key: string]: unknown;
}

// preset-manager.js:757: undefined for a name the API does not list.
export interface HostPresetManager {
  getCompletionPresetByName: (name?: string) => Record<string, unknown> | undefined;
  [key: string]: unknown;
}

export interface HostStreamingProcessor {
  messageId: number;
  isStopped: boolean;
  isFinished: boolean;
  abortController: AbortController;
  onProgressStreaming: (messageId: number, text: string, isFinal: boolean) => Promise<void>;
}

export interface ScriptHostModule {
  setGenerationParamsFromPreset: (preset: Record<string, unknown>) => void;
  isGenerating: () => boolean;
  stopGeneration: () => boolean;
  streamingProcessor: HostStreamingProcessor | null;
  chat: unknown[];
  getCurrentChatId: () => string | undefined;
  activateSendButtons: () => void;
  doNavbarIconClick: (this: Element) => Promise<void>;
  // script.js:405 — the name ST gives its own group `/sd` posts and tool-call rows.
  systemUserName: string;
  // Script.js:5929/5966/5981 — the main API's context, reply length and their difference.
  getMaxContextTokens?: () => number;
  getMaxResponseTokens?: () => number;
  getMaxPromptTokens?: (overrideResponseLength?: number | null) => number;
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
  // cache, unselects the book and refreshes `world_names`.
  deleteWorldInfo: (name: string) => Promise<boolean>;
  // Every entry of every active source (global, character, chat, persona), stamped
  // with `world`, decorators parsed and hashed, structured-cloned (world-info.js:4590). It emits
  // WORLDINFO_ENTRIES_LOADED on the way (:4604) and clones at :4638.
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
  openGroupById: (groupId: string) => Promise<boolean>;
  [key: string]: unknown;
}

// `custom` is destructured at shared.js:424 and `signal` reaches both services' `fetch`
// (CC :463, TC :483). `extractData: false` returns the raw reply JSON.
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
    sendRequest: (
      profileId: string,
      prompt: string | Array<{ role: string; content: string }>,
      maxTokens: number,
      custom?: HostModelRequestCustom,
      overridePayload?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  [key: string]: unknown;
}

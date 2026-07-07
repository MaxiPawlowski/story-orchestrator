const listeners = new Map<string, Set<(...args: any[]) => void>>();

const emit = (name: string, ...args: any[]) => {
  const set = listeners.get(name);
  if (!set) return;
  Array.from(set).forEach((handler) => {
    try {
      handler(...args);
    } catch {}
  });
};

const on = (name: string, handler: (...args: any[]) => void) => {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(handler);
};

const off = (name: string, handler: (...args: any[]) => void) => {
  listeners.get(name)?.delete(handler);
};

const extensionSettings: Record<string, any> = {};

export const tgPresetNames = ["Default", "Creative", "Balanced"];
export const tgPresetObjs: Record<string, any>[] = [];
export const TG_SETTING_NAMES: Record<string, string> = {};
export const BIAS_CACHE: Record<string, any> = {};
export const setSettingByName = (_name: string, _value: any) => {};
export const displayLogitBias = () => {};
export const setGenerationParamsFromPreset = (_preset: any) => {};
export const getMessageTimeStamp = () => "";
export const registerHostMacro = () => {};
export const unregisterHostMacro = () => {};
export const getCharacterNameById = (_id: number | undefined): string | undefined => undefined;
export const getCharacterIdByName = (_name: string): number | undefined => undefined;
export const getCharacters = (): any[] => [];
export const applyCharacterAN = async () => {};
export const clearCharacterAN = async () => {};
export const executeSlashCommands = async () => true;
export const enableWIEntry = async () => false;
export const disableWIEntry = async () => false;
export const sendConnectionProfileRequest = async () => "";
export const listConnectionProfiles = () => [];
export const getSelectedConnectionProfileId = (): string | null => null;
export const setStoryExtensionPrompt = () => {};
export const clearStoryExtensionPrompt = () => {};

export const getWorldInfoSettings = () => ({
  world_info: { globalSelect: ["Lorebook Alpha", "Lorebook Beta"] },
});

export const getAllCharacterNames = () => ["Narrator", "Arin", "Companion", "Guide"];

export const getContext = () => ({
  saveSettingsDebounced: () => {},
  extensionSettings,
  eventSource: { on, off, emit },
  eventTypes: {
    WORLDINFO_SETTINGS_UPDATED: "WORLDINFO_SETTINGS_UPDATED",
    WORLDINFO_UPDATED: "WORLDINFO_UPDATED",
    WORLDINFO_ENTRIES_LOADED: "WORLDINFO_ENTRIES_LOADED",
    CHAT_CHANGED: "CHAT_CHANGED",
    CHAT_CREATED: "CHAT_CREATED",
    GROUP_CHAT_CREATED: "GROUP_CHAT_CREATED",
    CHARACTER_DELETED: "CHARACTER_DELETED",
    CHARACTER_EDITED: "CHARACTER_EDITED",
  },
  loadWorldInfo: async () => ({
    entries: {
      1: { uid: 1, comment: "Ancient Gate" },
      2: { uid: 2, comment: "Ruins Cache" },
      3: { uid: 3, comment: "Companion Secret" },
    },
  }),
  groupId: "g1",
  chatId: "chat-storybook",
  groups: [
    { id: "g1", members: [{ name: "Arin" }, { name: "Companion" }] },
  ],
  SlashCommandParser: {
    commands: {
      checkpoint: {
        aliases: ["cp"],
        helpString: '<div>Story checkpoint command</div><code>/checkpoint list</code><span data-story-orchestrator="1"></span>',
      },
      bg: {
        aliases: [],
        helpString: '<div>Set background</div><code>/bg tavern</code>',
      },
    },
  },
});

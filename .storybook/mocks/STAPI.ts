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
export const sendConnectionProfileRequest = async () => ({ ok: true as const, text: "", finish: "stop" as const });
export const profileExists = () => false;
export const listConnectionProfiles = () => [];
export const getSelectedConnectionProfileId = (): string | null => null;
export const readProfileContextLimit = () => ({ value: 8192, source: "default" as const, reason: "Storybook has no connection profiles" });
export const countTokens = async (text: string) => Math.ceil(text.length / 4);
export const setStoryExtensionPrompt = () => {};
export const clearStoryExtensionPrompt = () => {};

export const getWorldInfoSettings = () => ({
  world_info: { globalSelect: ["Lorebook Alpha", "Lorebook Beta"] },
});

export const getAllCharacterNames = () => ["Narrator", "Arin", "Companion", "Guide"];

export const listBackgrounds = () => ["tavern day.jpg", "landscape postapoc.jpg"];
export const applyBackground = async (name: string) => ({ changed: true, from: "royal.jpg", to: name });
export const getCurrentBackground = () => ({ name: "royal.jpg", locked: false });
export const listGroupMembers = () => ["Arin", "Companion"];
export const listGlobalLorebooks = () => ["Lorebook Alpha", "Lorebook Beta"];
export const listPersonas = () => ["Traveller"];
export const showConfirmPopup = async () => true;
export const showTextPopup = async () => {};
export const showChoicePopup = async () => null;
let settingsBurst = 0;
export const observeNextSettingsSave = async () => ({ requested: true, status: 200, ok: true, timedOut: false, failed: false, burst: ++settingsBurst });
export const readServerExtensionSettings = async (key: string): Promise<Record<string, unknown> | null> => JSON.parse(JSON.stringify(extensionSettings[key] ?? {}));
export const capabilityReport = async (_options: { refresh?: boolean } = {}) => [];
export const hostFacts = async () => ({ stVersion: "1.13.0", stCommit: null, macroEngine: "new" as const });
export const judgeStatus = async () => null;
export const writeJudgeSecret = async (_value: string) => ({ ok: true as const });
export const harnessListed = () => false;
export const refreshHarnessStatus = async () => null;
export const isHostGenerating = () => false;
export const subscribeToHostEvents = () => () => {};
export const capabilityState = async () => "absent" as const;
export const spriteVnMode = () => false;
export const spriteReducedMotion = () => false;
export const spriteBuiltInExpressionsActive = () => false;
export const spriteCast = () => ({ members: [] });
export const getScannableEntries = async () => [];
export const registerImageSurface = () => () => {};
export const imageComfyUrl = (url: string) => url;
export const imageChat = () => ({
  id: "chat-storybook",
  groupId: "g1",
  folder: "storybook",
  userName: "Traveller",
  messages: [],
  characters: [
    { key: "arin.png", name: "Arin", description: "", appearance: "", enabled: true },
    { key: "companion.png", name: "Companion", description: "", appearance: "", enabled: true },
  ],
});
let imageChatState: unknown = null;
export const imageChatSettings = () => imageChatState;
export const imageWriteChatSettings = async (value: unknown) => {
  imageChatState = value;
  return { ok: true as const, chatId: "chat-storybook" };
};
export const imageReview = (content: HTMLElement) => {
  (document.getElementById("so-image-review-root") ?? document.body).appendChild(content);
  return new Promise<{ ok: true; accepted: boolean }>(() => undefined);
};

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
export const imageModel = () => null;
export const reserveGpu = async () => ({ ok: true as const });
export const releaseGpu = async () => undefined;
export const renewGpu = async () => ({ ok: true, renewed: true });
export const spriteBuilderMembers = (names: string[]) => names.map((name) => ({ name, folder: name }));
export const spriteList = async () => [];
export const spriteReferences = async () => [];
export const comfyDiscover = async () => { throw new Error("No image backend in Storybook."); };
export const comfyFingerprint = async () => { throw new Error("No model files in Storybook."); };
export const comfyReference = async () => { throw new Error("No uploads in Storybook."); };
export const comfyRenderOwned = async () => { throw new Error("No render jobs in Storybook."); };
export const spriteManifest = async () => null;
export const spriteReferenceSets = async () => [""];
export const spriteReferencePack = async (character: string, set: string) => ({ character, set, sha256: "a".repeat(64), files: [] });
export const comfyReleaseReference = async () => ({ ok: true, released: true });
export const gpuBrokerStatus = async () => null;
export const removeStorySprites = async () => ({ ok: false, reason: "No removals in Storybook." });
export const generatedSpriteSets = async () => [];
export const saveGeneratedSprite = async () => ({ ok: false, reason: "No uploads in Storybook." });
export const deleteGeneratedSprite = async () => ({ ok: false, reason: "No deletions in Storybook." });
export const stImageReadiness = async () => ({ ready: false, reason: "No image backend in Storybook.", source: null });
export const renderStImage = async () => { throw new Error("No image backend in Storybook."); };

export interface SpikeRow {
  name: string;
  is_user: boolean;
  mes: string;
  send_date?: string;
  swipes?: string[];
  swipe_id?: number;
}

type Handler = (...args: unknown[]) => unknown;

export const spikeContext = {
  chat: [] as SpikeRow[],
  groupId: "g-test" as string | undefined,
  chatId: "chat-a" as string | undefined,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: async () => undefined,
  saveMetadataDebounced: () => undefined,
  saveSettingsDebounced: () => undefined,
};

const listeners = new Map<string, Handler[]>();

export const spikeEvents = {
  async emit(name: string, ...args: unknown[]) {
    for (const handler of [...(listeners.get(name) ?? [])]) await handler(...args);
  },
  count: () => [...listeners.values()].reduce((sum, handlers) => sum + handlers.length, 0),
};

export const resetSpikeHost = () => {
  listeners.clear();
  spikeContext.chat = [];
  spikeContext.chatId = "chat-a";
  spikeContext.chatMetadata = { integrity: "i-a" };
  spikeContext.extensionSettings = {};
};

const ok = async () => ({ ok: true as const, changed: false });

export const spikeStapi = {
  getContext: () => spikeContext,
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  guardHostStream: () => ({ halt: () => false, release: () => undefined }),
  saveOpenChat: async () => ({ ok: true as const, chatId: "" }),
  setStoryExtensionPrompt: () => undefined,
  clearStoryExtensionPrompt: () => undefined,
  applyCharacterAN: async () => undefined,
  clearCharacterAN: async () => undefined,
  applyTextGenPresetRuntime: () => undefined,
  findTextGenPreset: () => null,
  disableWIEntry: ok,
  enableWIEntry: ok,
  lorebookExists: () => false,
  upsertWIEntry: async () => "created",
  ensureLorebook: async (name: string) => ({ name, created: false }),
  loadLorebook: async () => ({ name: "mirror", entries: {} }),
  bindChatLorebook: () => "bound",
  unbindChatLorebook: async (name: string) => ({ ok: true, name }),
  countTokens: async (text: string) => Math.ceil((text?.length ?? 0) / 4),
  readProfileContextLimit: () => ({ value: 32768, source: "preset" }),
  vectorInsert: async () => undefined,
  vectorQuery: async () => [],
  vectorPurge: async () => undefined,
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: async () => true,
  setGroupMembersDisabled: async () => ({ ok: true, group: "g1" }),
  settingsAreLoaded: () => true,
  settingsReady: async () => undefined,
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  readAppliedPreset: () => null,
  getActiveGroup: () => null,
  resolveGroupMemberId: () => null,
  getCharacterNameById: () => undefined,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: () => ({ close: () => undefined }),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string | undefined; handler: Handler }>) => {
    const added = entries.filter((entry): entry is { eventName: string; handler: Handler } => typeof entry.eventName === "string");
    for (const entry of added) listeners.set(entry.eventName, [...(listeners.get(entry.eventName) ?? []), entry.handler]);
    return () => {
      for (const entry of added) listeners.set(entry.eventName, (listeners.get(entry.eventName) ?? []).filter((handler) => handler !== entry.handler));
    };
  },
};

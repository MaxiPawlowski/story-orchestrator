import { RuntimeManager } from "./runtimeManager";

const mockContext = {
  chat: [] as Array<{ mes: string; name?: string; is_user?: boolean }>,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  groupId: "g-test", chatId: "chat-manual",
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  settingsAreLoaded: () => true,
  readProfileContextLimit: () => ({ value: 8192, source: "default", reason: "no memory model profile is selected" }),
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => mockContext,
  saveOpenChat: async () => { await mockContext.saveMetadata(); return { ok: true as const, chatId: "" }; },
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  disableWIEntry: jest.fn(async () => undefined),
  enableWIEntry: jest.fn(async () => undefined),
  lorebookExists: () => false,
  upsertWIEntry: jest.fn(async () => "created"),
  ensureLorebook: jest.fn(async () => null),
  loadLorebook: jest.fn(async () => null),
  bindChatLorebook: jest.fn(() => "no-chat"),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  vectorInsert: jest.fn(async () => { throw new Error("no vectors in jest"); }),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  getActiveGroup: jest.fn(() => null),
  resolveGroupMemberId: jest.fn(() => null),
  getCharacterNameById: () => undefined,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(async () => undefined),
}));

const story = {
  format: 2,
  id: "manual-read",
  title: "Manual Read",
  description: "batch-2 regression fixture.",
  qualities: [{ key: "has_key", type: "bool", source: "extractor", rubric: "Does the player hold the brass key?" }],
  checkpoints: [{ id: "hall", name: "The Hall", objective: "Find the key.", type: "anchor", start: true }, { id: "vault", name: "The Vault", objective: "Open it.", type: "anchor" }],
  transitions: [{ from: "hall", to: "vault", priority: 1, gate: { q: "has_key", op: "==", v: true } }],
  roster: [{ id: "mara", name: "Mara" }],
};

const setup = async () => {
  mockContext.chat = [{ mes: "Welcome to the hall.", name: "Mara" }, { mes: "The key is under the mat.", name: "Mara" }, { mes: "I pick up the brass key.", name: "Max", is_user: true }];
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify(story));
  return manager;
};

describe("a manual read reads the chat through the manager's own wiring (v2.5 batch 2 regression)", () => {
  it("runExtractionNow with no window reads the transcript as it is now and records an audit", async () => {
    const manager = await setup();
    await expect(manager.runExtractionNow('DELTA has_key value=true evidence="I pick up the brass key"')).resolves.toBe(true);
    const audit = manager.getSnapshot().extraction.audits.at(-1);
    expect(audit).toMatchObject({ reason: "manual", window: { from: 0, to: 2 } });
    expect(audit?.acceptedDeltas).toEqual([expect.objectContaining({ delta: expect.objectContaining({ q: "has_key", v: true }), messageId: 2 })]);
    await manager.commitBoundary();
    expect(manager.getSnapshot().activeCheckpointId).toBe("vault");
  });
});

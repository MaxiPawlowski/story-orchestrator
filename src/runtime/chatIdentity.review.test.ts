import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import { classifyChatChange, type ChatChangeInput } from "./chatIdentity";
import { beginRun } from "./runToken";

// v2.4 plan 02 §3. A same-chat CHAT_CHANGED (H9: `reloadCurrentChat` behind `/persona-sync` or a persona
// change) keeps this chat's run: no reset, no reload, no epoch bump, and the reloaded chat is reconciled
// against the fingerprints. Anything that cannot prove "same chat" is today's switch.

interface Row { name: string; is_user: boolean; mes: string; send_date?: string }

const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
const mockContext = {
  chat: [] as Row[],
  chatId: "chat-a" as string | undefined,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/STAPI", () => ({
  getContext: () => mockContext,
  setStoryExtensionPrompt: () => undefined,
  clearStoryExtensionPrompt: () => undefined,
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
  disableWIEntry: jest.fn(async () => ({ ok: true, changed: false })),
  enableWIEntry: jest.fn(async () => ({ ok: true, changed: false })),
  lorebookExists: () => false,
  upsertWIEntry: jest.fn(async () => "created"),
  ensureLorebook: jest.fn(async (name: string) => ({ name, created: false })),
  loadLorebook: jest.fn(async () => ({ name: "mirror", entries: {} })),
  bindChatLorebook: jest.fn(() => "bound"),
  unbindChatLorebook: jest.fn(async (name: string) => ({ ok: true, name })),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  vectorInsert: jest.fn(async () => undefined),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => ({ ok: true, group: "g1" })),
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: jest.fn(async () => ({ requested: true, status: 200, ok: true, timedOut: false })),
  readServerBoundary: async () => null,
  applyPreset: jest.fn(() => ({ ok: true, name: "P" })),
  presetBackend: () => "textgenerationwebui",
  readAppliedPreset: () => null,
  getActiveGroup: () => null,
  resolveGroupMemberId: () => null,
  getCharacterNameById: () => undefined,
  readInjectedPromptBlocks: () => [],
  showTextPopup: jest.fn(() => ({ close: () => undefined })),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) mockHandlers.set(entry.eventName, entry.handler);
    return () => mockHandlers.clear();
  },
}));

const story = {
  format: 2,
  id: "reload-story",
  title: "Reload story",
  description: "Same-chat reload fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};

const line = (index: number, text = `line ${index}`): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: text, send_date: `t${index}` });
const settle = async () => { for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const emit = async (name: string, ...args: unknown[]) => { await mockHandlers.get(name)?.(...args); await settle(); };
type Outcome = { result: string; fromMessage: number | null } | null | undefined;
const lastOutcome = (manager: RuntimeManager): Outcome => (manager as unknown as { notices: { lastOutcome?: Outcome } }).notices.lastOutcome;
const journalSummaries = (manager: RuntimeManager) => (manager as unknown as { extras: { journal: Array<{ summary: string }> } }).extras.journal.map((record) => record.summary);

/** What `reloadCurrentChat` leaves behind: the server's copy of the chat and its metadata, same id. */
const reloadFromServer = (edit?: (metadata: Record<string, unknown>, chat: Row[]) => void) => {
  const metadata = JSON.parse(JSON.stringify(mockContext.chatMetadata)) as Record<string, unknown>;
  const chat = JSON.parse(JSON.stringify(mockContext.chat)) as Row[];
  edit?.(metadata, chat);
  mockContext.chatMetadata = metadata;
  mockContext.chat = chat;
};

async function openedAndPlayed() {
  const manager = new RuntimeManager();
  new TurnBridge(manager, manager.chatSave).start();
  await emit("CHAT_CHANGED");
  await manager.importStory(JSON.stringify(story));
  mockContext.chat = [line(0), line(1)];
  await manager.commitBoundary();
  mockContext.chat.push(line(2), line(3));
  await manager.setQuality("go", "true");
  expect(manager.getEngineState()).toMatchObject({ activeCheckpointId: "next", boundary: 2 });
  return manager;
}

beforeEach(() => {
  mockHandlers.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-a" };
  mockContext.extensionSettings = {};
});

describe("v2.4 plan 02 §3: classifyChatChange", () => {
  const same: ChatChangeInput = { openChat: "chat-a", claimedChat: "chat-a", loadedIntegrity: "i-a", currentIntegrity: "i-a", storyId: "s", engineBoundary: 4, storedBoundary: 4 };

  it("is the same chat only when the chat, the integrity and the stored boundary all agree", () => {
    expect(classifyChatChange(same)).toEqual({ kind: "same-chat" });
  });

  it("is diverged when the copy ST loaded holds another boundary", () => {
    expect(classifyChatChange({ ...same, storedBoundary: 3 }).kind).toBe("diverged");
    expect(classifyChatChange({ ...same, storedBoundary: null }).kind).toBe("diverged");
  });

  it.each([
    ["another chat is open", { openChat: "chat-b" }],
    ["the epoch was minted in another chat", { claimedChat: "chat-b" }],
    ["the integrity changed (a branch or another file under this id)", { currentIntegrity: "i-b" }],
    ["nothing recorded an integrity at load", { loadedIntegrity: null, currentIntegrity: null }],
    ["no story is loaded", { storyId: null }],
  ])("is a switch when %s", (_why, change) => {
    expect(classifyChatChange({ ...same, ...change })).toEqual({ kind: "switch" });
  });
});

describe("v2.4 plan 02 §3: a same-chat reload on the real bridge", () => {
  it("keeps the epoch and the runs, and loads nothing", async () => {
    const manager = await openedAndPlayed();
    const epoch = manager.getRunContext().sessionEpoch;
    const run = beginRun(manager.getOwnership());
    const load = jest.spyOn(manager, "loadSelectedFromChat");
    reloadFromServer();
    await emit("CHAT_CHANGED");
    expect(load).not.toHaveBeenCalled();
    expect(manager.getRunContext().sessionEpoch).toBe(epoch);
    expect(run.stillOwns()).toBe(true);
    expect(lastOutcome(manager)).toBeUndefined();
    expect(manager.getEngineState()).toMatchObject({ activeCheckpointId: "next", boundary: 2 });
  });

  it("reconciles the reloaded chat against the fingerprints", async () => {
    const manager = await openedAndPlayed();
    reloadFromServer((_metadata, chat) => { chat[2].mes = "rewritten on disk"; });
    await emit("CHAT_CHANGED");
    expect(lastOutcome(manager)).toMatchObject({ result: "applied", fromMessage: 2 });
    expect(manager.getEngineState()?.activeCheckpointId).toBe("start");
  });

  it("a copy holding another boundary is today's full reload, journaled reload-diverged", async () => {
    const manager = await openedAndPlayed();
    const epoch = manager.getRunContext().sessionEpoch;
    reloadFromServer((metadata) => {
      const blob = metadata.story_orchestrator as { stories: Record<string, { engineState: { boundary: number } }> };
      blob.stories["reload-story"].engineState.boundary = 1;
    });
    await emit("CHAT_CHANGED");
    expect(manager.getRunContext().sessionEpoch).toBeGreaterThan(epoch);
    expect(journalSummaries(manager)).toContain("reload-diverged");
  });

  it("control: another chat is a switch, which bumps the epoch", async () => {
    const manager = await openedAndPlayed();
    const epoch = manager.getRunContext().sessionEpoch;
    mockContext.chatId = "chat-b";
    mockContext.chatMetadata = { integrity: "i-b" };
    mockContext.chat = [];
    await emit("CHAT_CHANGED");
    expect(manager.getRunContext().sessionEpoch).toBeGreaterThan(epoch);
    expect(manager.getSnapshot().ready).toBe(false);
  });

  it("control: the same id with a new integrity is a switch", async () => {
    const manager = await openedAndPlayed();
    const epoch = manager.getRunContext().sessionEpoch;
    reloadFromServer((metadata) => { metadata.integrity = "i-other"; });
    await emit("CHAT_CHANGED");
    expect(manager.getRunContext().sessionEpoch).toBeGreaterThan(epoch);
  });
});

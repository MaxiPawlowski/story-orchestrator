/**
 * @jest-environment jsdom
 */
// v2.4 E3 + E5, against the REAL startRuntime: the page's first load unbinds an unadopted branch's
// inherited mirror (E5), and the chat-write and wizard-session evidence reach the runtime only while it
// runs (E3). A narrower harness would prove only that the helpers work, not that startup calls them.

const PARENT_BOOK = "Story Orchestrator - Branch story - chat-a";
const branchMetadata = () => ({
  main_chat: "chat-a",
  integrity: "i-branch",
  world_info: PARENT_BOOK,
  story_orchestrator: {
    version: 4,
    chatId: "chat-a",
    integrity: "i-a",
    selectedStoryId: "branch-story",
    stories: { "branch-story": { storyId: "branch-story", engineState: { activeCheckpointId: "start" }, pinnedStory: { checkpoints: [{ id: "start", name: "The Gate" }] }, extras: { memory: { wiBook: { name: PARENT_BOOK, chatId: "chat-a" } } } } },
  },
});

const mockHost = {
  context: { chat: [] as unknown[], chatId: "branch-1", extensionSettings: {} as Record<string, unknown>, chatMetadata: branchMetadata() as Record<string, unknown>, characters: [], groups: [], saveSettingsDebounced: () => {} },
  unbound: [] as string[],
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  noteHostSettingsLoaded: () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false, failed: false }),
  observeNextSettingsSave: async () => ({ requested: true, status: 500, ok: false, timedOut: false, failed: false }),
  readServerExtensionSettings: async () => null,
  readServerBoundary: async () => null,
  saveOpenChat: async () => ({ ok: true, chatId: mockHost.context.chatId, observed: Promise.resolve({ requested: true, status: 200, ok: true, timedOut: false, failed: false }) }),
  unbindChatLorebook: async (name: string) => {
    if (mockHost.context.chatMetadata.world_info !== name) return { ok: false, reason: "the slot names another book" };
    delete mockHost.context.chatMetadata.world_info;
    mockHost.unbound.push(name);
    return { ok: true, name };
  },
  getContext: () => mockHost.context,
  registerHostMacro: () => {},
  unregisterHostMacro: () => {},
  subscribeToHostEvents: () => () => {},
  judgeTransport: async () => ({ model: null, answers: null }),
  judgeStatus: async () => null,
  getPlayerName: () => "Max",
  getActiveGroup: () => null,
  getActiveCharacterId: () => null,
  getCharacterNameById: () => null,
  getScannableEntries: async () => [],
  forceActivateEntries: async () => true,
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
  executeSlashCommands: async () => ({ pipe: "" }),
  willAddUserMessage: () => false,
  readInjectedPromptBlocks: () => [],
  showTextPopup: async () => undefined,
}));

import { runtimeManager } from "./runtimeManager";
import { setSelectedStoryId } from "./persistence";
import { saveWizardSession } from "./wizardSessions";

const settle = async () => { for (let index = 0; index < 30; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

beforeEach(() => {
  mockHost.context.chatId = "branch-1";
  mockHost.context.chatMetadata = branchMetadata();
  mockHost.context.extensionSettings = {};
  mockHost.unbound = [];
});

describe("v2.4 E5: startRuntime's first load", () => {
  it("unbinds the parent's mirror from an unadopted branch it opens on", async () => {
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    stopRuntime();
    expect(mockHost.unbound).toEqual([PARENT_BOOK]);
    expect(mockHost.context.chatMetadata.world_info).toBeUndefined();
    expect((mockHost.context.chatMetadata.story_orchestrator as { chatId: string }).chatId).toBe("chat-a");
  });

  it("control: a chat of its own keeps its binding", async () => {
    const own = branchMetadata();
    delete (own as Record<string, unknown>).main_chat;
    own.story_orchestrator = { version: 4, chatId: "branch-1", integrity: "i-branch", selectedStoryId: null, stories: {} } as never;
    mockHost.context.chatMetadata = own;
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    stopRuntime();
    expect(mockHost.unbound).toEqual([]);
    expect(mockHost.context.chatMetadata.world_info).toBe(PARENT_BOOK);
  });
});

describe("v2.4 E3: startRuntime routes save evidence", () => {
  it("hands chat writes to the chat save, and stops at stopRuntime", async () => {
    mockHost.context.chatMetadata = {};
    const recordWrite = jest.spyOn(runtimeManager.chatSave, "recordWrite");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    recordWrite.mockClear();
    setSelectedStoryId(null);
    await settle();
    expect(recordWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: "select", chatId: "branch-1" }));
    stopRuntime();
    recordWrite.mockClear();
    setSelectedStoryId(null);
    await settle();
    expect(recordWrite).not.toHaveBeenCalled();
    recordWrite.mockRestore();
  });

  it("journals an unconfirmed wizard session save into the open chat, and stops at stopRuntime", async () => {
    mockHost.context.chatMetadata = {};
    const noteRecap = jest.spyOn(runtimeManager, "noteRecap");
    const { startRuntime, stopRuntime } = await import("./index");
    startRuntime();
    await settle();
    noteRecap.mockClear();
    await saveWizardSession({ key: "sun-ruins", stage: "provisioning", history: [], questions: [], applied: [], seed: "", updatedAt: "" } as never);
    await settle();
    expect(noteRecap).toHaveBeenCalledWith("wizard session save not confirmed", "wizard session sun-ruins: the settings save answered 500");
    stopRuntime();
    noteRecap.mockClear();
    await saveWizardSession({ key: "sun-ruins", stage: "provisioning", history: [], questions: [], applied: [], seed: "", updatedAt: "" } as never);
    await settle();
    expect(noteRecap).not.toHaveBeenCalled();
    noteRecap.mockRestore();
  });
});

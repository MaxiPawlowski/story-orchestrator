// v2.4 plan 03 D5 follow-up. A story imported into a long chat used to summarize the chat's whole prior
// history at its first scene break: automatic, map/reduce, many requests, no preflight. The first scene
// now starts where the story's play starts in this chat; history before it is the manual backlog's.

import { RuntimeManager } from "./runtimeManager";
import type { StoryOrchestratorMetadataBlob } from "./types";

type Message = { mes: string; name: string; is_user: boolean };

const mockContext = {
  chat: [] as Message[],
  groupId: "g-test", chatId: "chat-1",
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => mockContext,
  saveOpenChat: async () => { await mockContext.saveMetadata(); return { ok: true as const, chatId: "" }; },
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
  disableWIEntry: jest.fn(async () => undefined),
  enableWIEntry: jest.fn(async () => undefined),
  upsertWIEntry: jest.fn(async () => "created"),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  readProfileContextLimit: () => ({ value: 32768, source: "preset" }),
  vectorInsert: jest.fn(async () => undefined),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  getActiveGroup: jest.fn(() => null),
  resolveGroupMemberId: jest.fn(() => null),
  getCharacterNameById: jest.fn(() => undefined),
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(async () => undefined),
  showConfirmPopup: jest.fn(async () => true),
}));

const storyJson = JSON.stringify({
  format: 2,
  id: "sun-ruins",
  title: "Quest for the Sun Ruins",
  description: "A desert expedition.",
  qualities: [{ key: "found_key", type: "bool", source: "extractor", rubric: "Did they find the key?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Look around.", type: "anchor", start: true },
    { id: "door", name: "Door", objective: "Open it.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "door", priority: 1, gate: { q: "found_key", op: "==", v: true } }],
  roster: [],
});

const growChatTo = (length: number) => {
  for (let index = mockContext.chat.length; index < length; index += 1) {
    const user = index % 2 === 0;
    mockContext.chat.push({ mes: `line ${index}`, name: user ? "Player" : "Mara", is_user: user });
  }
};

const blob = () => mockContext.chatMetadata.story_orchestrator as unknown as StoryOrchestratorMetadataBlob;

const sceneRanges = () => blob().stories["sun-ruins"].extras.memory.derived
  .filter((record) => record.kind === "scene_summary")
  .map((record) => record.range);

const sceneBreakAt = async (manager: RuntimeManager, to: number) => {
  growChatTo(to + 1);
  await manager.runSceneBreakPass({ window: { from: Math.max(0, to - 4), to }, sceneBreak: { reason: "location" }, reason: "cadence", acceptedDeltas: [] } as never);
};

beforeEach(() => {
  mockContext.chat = [];
  mockContext.chatId = "chat-1";
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  globalThis.storyOrchestratorDebugSceneSummaryResponse = "A summary.";
});

afterEach(() => {
  delete globalThis.storyOrchestratorDebugSceneSummaryResponse;
});

describe("v2.4 plan 03 D5: the first scene starts at the story's start", () => {
  it("a story imported into a chat with prior history summarizes only from the story's start at its first scene break", async () => {
    growChatTo(300);
    const manager = new RuntimeManager();
    await manager.importStory(storyJson);
    await sceneBreakAt(manager, 309);
    expect(sceneRanges()).toEqual([{ from: 298, to: 309 }]);
  });

  it("control: a fresh chat whose player has not spoken yet still starts at 0, greetings included", async () => {
    mockContext.chat.push({ mes: "Welcome.", name: "Mara", is_user: false }, { mes: "Hello too.", name: "Oren", is_user: false });
    const manager = new RuntimeManager();
    await manager.importStory(storyJson);
    await sceneBreakAt(manager, 9);
    expect(sceneRanges()).toEqual([{ from: 0, to: 9 }]);
  });

  it("control: a later scene still starts after the previous summary", async () => {
    growChatTo(300);
    const manager = new RuntimeManager();
    await manager.importStory(storyJson);
    await sceneBreakAt(manager, 309);
    await sceneBreakAt(manager, 320);
    expect(sceneRanges()).toEqual([{ from: 298, to: 309 }, { from: 310, to: 320 }]);
  });

  it("a reopened chat keeps the start it recorded instead of re-anchoring at the chat's end", async () => {
    growChatTo(300);
    await new RuntimeManager().importStory(storyJson);
    growChatTo(330);
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    await sceneBreakAt(reopened, 339);
    expect(sceneRanges()).toEqual([{ from: 298, to: 339 }]);
  });

  it("restart re-anchors the story's start at the chat's position then", async () => {
    growChatTo(300);
    const manager = new RuntimeManager();
    await manager.importStory(storyJson);
    await sceneBreakAt(manager, 309);
    growChatTo(340);
    expect(await manager.restartStory(true)).toBe(true);
    await sceneBreakAt(manager, 349);
    expect(sceneRanges()).toEqual([{ from: 338, to: 349 }]);
  });

  it("a rollback before the story's start clamps it to the rollback point", async () => {
    growChatTo(300);
    const manager = new RuntimeManager();
    await manager.importStory(storyJson);
    mockContext.chat.length = 200;
    await manager.rollbackFromMessage(200);
    await sceneBreakAt(manager, 205);
    expect(sceneRanges()).toEqual([{ from: 200, to: 205 }]);
  });
});

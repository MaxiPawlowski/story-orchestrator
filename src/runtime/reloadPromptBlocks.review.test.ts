import { settleTurns } from "../../test/support/settle";
import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import { control, finding, must } from "../../test/findings/ledger";

// v2.4 acceptance A1/A2 (2026-09-25, rows I3/I7, probes test/scenarios/v24-acc-A-reload-blocks*.json).
// ST's clearChat reassigns `extension_prompts = {}` (script.js:1590) on every chat load, and a
// same-chat reloadCurrentChat runs it too (script.js:1712) before emitting CHAT_CHANGED with the same
// id. The real extension-prompt seam runs here against a host that behaves that way.

interface Row { name: string; is_user: boolean; mes: string; send_date?: string }
interface Prompt { value: string; position: number; depth: number; scan: boolean; role: number }

const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
const mockContext = {
  chat: [] as Row[],
  groupId: "g-test", chatId: "chat-a" as string | undefined,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  extensionPrompts: {} as Record<string, Prompt | undefined>,
  setExtensionPrompt: (key: string, value: string, position: number, depth: number, scan = false, role = 0) => {
    mockContext.extensionPrompts[key] = { value: String(value), position, depth, scan, role };
  },
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

type Seam = typeof import("@services/stHost/extensionPrompts");
const mockSeam = (): Seam => jest.requireActual<Seam>("@services/stHost/extensionPrompts");

jest.mock("@services/stHost/context", () => ({ getContext: () => mockContext }));

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  getContext: () => mockContext,
  saveOpenChat: async () => { await mockContext.saveMetadata?.(); return { ok: true as const, chatId: "" }; },
  setStoryExtensionPrompt: (key: string, text: string, depth: number) => mockSeam().setStoryExtensionPrompt(key, text, depth),
  clearStoryExtensionPrompt: (key: string) => mockSeam().clearStoryExtensionPrompt(key),
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
  readAppliedPreset: () => null,
  getActiveGroup: () => null,
  resolveGroupMemberId: () => null,
  getCharacterNameById: () => undefined,
  readInjectedPromptBlocks: () => [],
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(() => ({ close: () => undefined })),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) mockHandlers.set(entry.eventName, entry.handler);
    return () => mockHandlers.clear();
  },
}));

const story = {
  format: 2,
  id: "reload-blocks-story",
  title: "Reload blocks story",
  description: "Same-chat reload keeps the prompt blocks.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Find the courier before dusk.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Cross the river at the ford.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};

const GUIDANCE = "story_orchestrator_guidance";
const NUDGE = "story_copilot_nudge";

const line = (index: number): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: `line ${index}`, send_date: `t${index}` });
const settle = () => settleTurns(20);
const emit = async (name: string, ...args: unknown[]) => { await mockHandlers.get(name)?.(...args); await settle(); };
const storyBlocks = () => Object.fromEntries(Object.entries(mockContext.extensionPrompts).filter(([key, entry]) => key.startsWith("story_") && entry?.value).map(([key, entry]) => [key, entry?.value]));

const clearChat = () => { mockContext.extensionPrompts = {}; };

const reloadSameChat = async () => {
  clearChat();
  mockContext.chatMetadata = JSON.parse(JSON.stringify(mockContext.chatMetadata)) as Record<string, unknown>;
  mockContext.chat = JSON.parse(JSON.stringify(mockContext.chat)) as Row[];
  await emit("CHAT_CHANGED");
};

const switchTo = async (chatId: string) => {
  clearChat();
  mockContext.chatId = chatId;
  mockContext.chatMetadata = { integrity: `i-${chatId}` };
  mockContext.chat = [];
  await emit("CHAT_CHANGED");
};

async function openedAndPlayed() {
  const manager = new RuntimeManager();
  new TurnBridge(manager, manager.chatSave).start();
  await emit("CHAT_CHANGED");
  await manager.importStory(JSON.stringify(story));
  mockContext.chat = [line(0), line(1)];
  await manager.commitBoundary();
  expect(storyBlocks()[GUIDANCE]).toContain("Find the courier");
  return manager;
}

beforeEach(() => {
  mockHandlers.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-chat-a" };
  mockContext.extensionSettings = {};
  clearChat();
});

finding("ACC-A1", async () => {
  const manager = await openedAndPlayed();
  const before = storyBlocks();
  const epoch = manager.getRunContext().sessionEpoch;
  await reloadSameChat();
  expect(manager.getRunContext().sessionEpoch).toBe(epoch);
  const after = storyBlocks();
  must(
    JSON.stringify(after) === JSON.stringify(before),
    `the story's blocks are missing after a same-chat reload: before ${JSON.stringify(Object.keys(before))}, after ${JSON.stringify(Object.keys(after))}`,
  );
});

test("A1: after a same-chat reload, a later unchanged rewrite reaches the host", async () => {
  const manager = await openedAndPlayed();
  await reloadSameChat();
  clearChat();
  manager.clearPrivateInjection();
  expect(storyBlocks()[GUIDANCE]).toContain("Find the courier");
});

control("A1: a switch to a chat with no story leaves no story block behind", async () => {
  await openedAndPlayed();
  await switchTo("chat-b");
  expect(storyBlocks()).toEqual({});
});

control("A1: without a reload, an unchanged block is not written again", async () => {
  const manager = await openedAndPlayed();
  const write = jest.spyOn(mockContext, "setExtensionPrompt");
  manager.clearPrivateInjection();
  expect(write.mock.calls.filter(([key]) => key === GUIDANCE)).toEqual([]);
  write.mockRestore();
});

finding("ACC-A2", async () => {
  const manager = await openedAndPlayed();
  manager.setCopilotNudge("Let the courier run.");
  expect(manager.getActiveNudge()).toBe("Let the courier run.");
  await switchTo("chat-b");
  const reported = manager.getActiveNudge() ?? manager.getSnapshot().activeNudge;
  must(reported === null, `the nudge set in another chat is still reported active in chat-b: ${JSON.stringify(reported)}`);
  manager.setCopilotNudge("Let the courier run.");
  must(storyBlocks()[NUDGE] === "Let the courier run.", `re-setting the same nudge in chat-b did not inject it: ${JSON.stringify(storyBlocks())}`);
  expect(manager.getActiveNudge()).toBe("Let the courier run.");
});

test("A2: returning to the chat the nudge was set in does not bring it back", async () => {
  const manager = await openedAndPlayed();
  manager.setCopilotNudge("Let the courier run.");
  await switchTo("chat-b");
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-chat-a" };
  await emit("CHAT_CHANGED");
  expect(manager.getActiveNudge()).toBeNull();
  expect(storyBlocks()[NUDGE]).toBeUndefined();
});

test("A2: a same-chat reload keeps the nudge and puts it back in the prompt", async () => {
  const manager = await openedAndPlayed();
  manager.setCopilotNudge("Let the courier run.");
  await reloadSameChat();
  expect(manager.getActiveNudge()).toBe("Let the courier run.");
  expect(storyBlocks()[NUDGE]).toBe("Let the courier run.");
});

test("A2: once ST has opened another chat, the nudge is not active there even before CHAT_CHANGED reaches the bridge", async () => {
  const manager = await openedAndPlayed();
  manager.setCopilotNudge("Let the courier run.");
  mockContext.chatId = "chat-b";
  expect(manager.getActiveNudge()).toBeNull();
  expect(manager.getSnapshot().activeNudge).toBeNull();
});

control("A2: a nudge in its own chat applies once and is spent by clearing it", async () => {
  const manager = await openedAndPlayed();
  const write = jest.spyOn(mockContext, "setExtensionPrompt");
  manager.setCopilotNudge("Let the courier run.");
  manager.setCopilotNudge("Let the courier run.");
  expect(write.mock.calls.filter(([key]) => key === NUDGE)).toHaveLength(1);
  expect(manager.getSnapshot().activeNudge).toBe("Let the courier run.");
  manager.clearCopilotNudge();
  expect(manager.getActiveNudge()).toBeNull();
  expect(storyBlocks()[NUDGE]).toBeUndefined();
  write.mockRestore();
});

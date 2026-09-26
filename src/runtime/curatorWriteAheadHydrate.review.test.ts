import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";

interface Row { name: string; is_user: boolean; mes: string; send_date?: string }
interface Prompt { value: string; position: number; depth: number; scan: boolean; role: number }

const mockEntry: { current: { comment: string; content: string; keys: string[]; constant: boolean; disabled: boolean; uid: number } | null } = { current: null };
const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
const mockContext = {
  chat: [] as Row[],
  chatId: "chat-a" as string | undefined,
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
  readWIEntryAt: jest.fn(async () => mockEntry.current),
  readWIEntry: jest.fn(async () => mockEntry.current),
  updateWIEntryByUid: jest.fn(async () => ({ ok: true, confirmed: true })),
  restoreWIEntryAt: jest.fn(async () => ({ ok: true, confirmed: true })),
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
  id: "write-ahead-story",
  title: "Write-ahead story",
  description: "A curator write-ahead marker survives a reload.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Find the courier before dusk.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Cross the river at the ford.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
  stagecraft: { lorebooks: ["Story Lore"] },
};

const ORIGINAL = "The ford is shallow.";
const WRITTEN = "The ford is flooded.";

const line = (index: number): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: `line ${index}`, send_date: `t${index}` });
const settle = async () => { for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const emit = async (name: string, ...args: unknown[]) => { await mockHandlers.get(name)?.(...args); await settle(); };

const reopen = async (metadata: Record<string, unknown>) => {
  mockContext.chatId = "chat-b";
  mockContext.chatMetadata = { integrity: "i-chat-b" };
  mockContext.chat = [];
  await emit("CHAT_CHANGED");
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = metadata;
  mockContext.chat = [line(0), line(1)];
  await emit("CHAT_CHANGED");
};

const plantCrashedWrite = (metadata: Record<string, unknown>) => {
  const blob = metadata.story_orchestrator as { stories: Record<string, { extras: { stagecraft: { proposals: unknown[] } } }> };
  blob.stories["write-ahead-story"].extras.stagecraft.proposals = [{
    id: "wi-1-1", curator: "wi", at: "2026-09-25T09:59:00.000Z", boundary: 1, messageId: 1, checkpointId: "start", reason: "curator", summary: "The ford.", mode: "auto", dropped: [],
    ops: [{
      op: { kind: "rewrite", lorebook: "Story Lore", comment: "The ford", text: WRITTEN, uid: 7 }, status: "accepted",
      before: { content: ORIGINAL, disabled: false, uid: 7 }, after: { content: WRITTEN, disabled: false },
      target: { lorebookFileId: "Story Lore", uid: 7 }, writeAhead: { status: "pending", at: "2026-09-25T10:00:00.000Z", messageId: 1 },
    }],
  }];
};

async function crashedAndReloaded(live: string) {
  const manager = new RuntimeManager();
  new TurnBridge(manager, manager.chatSave).start();
  await emit("CHAT_CHANGED");
  await manager.importStory(JSON.stringify(story));
  mockContext.chat = [line(0), line(1)];
  await manager.commitBoundary();
  const saved = JSON.parse(JSON.stringify(mockContext.chatMetadata)) as Record<string, unknown>;
  plantCrashedWrite(saved);
  mockEntry.current = { comment: "The ford", content: live, keys: ["ford"], constant: false, disabled: false, uid: 7 };
  await reopen(saved);
  return manager;
}

beforeEach(() => {
  mockHandlers.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-chat-a" };
  mockContext.extensionSettings = {};
  mockEntry.current = null;
});

test("C10: a reload settles a curator write that landed before the crash, and the next boundary does not write it again", async () => {
  const { updateWIEntryByUid } = jest.requireMock("@services/STAPI") as { updateWIEntryByUid: jest.Mock };
  const manager = await crashedAndReloaded(WRITTEN);
  const op = manager.getStagecraftState().proposals[0]?.ops[0];
  expect(op).toMatchObject({ status: "applied" });
  expect(op?.writeAhead).toBeUndefined();
  expect(await manager.applyCuratorProposals()).toBe(0);
  expect(updateWIEntryByUid).not.toHaveBeenCalled();
});

test("C10 control: a reload over a write that never landed leaves it accepted for the next boundary", async () => {
  const manager = await crashedAndReloaded(ORIGINAL);
  const op = manager.getStagecraftState().proposals[0]?.ops[0];
  expect(op).toMatchObject({ status: "accepted" });
  expect(op?.writeAhead).toBeUndefined();
});

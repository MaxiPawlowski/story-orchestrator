import { settleTurns } from "../../test/support/settle";
import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";

interface Row { name: string; is_user: boolean; mes: string; send_date?: string }

const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
const mockContext = {
  chat: [] as Row[],
  groupId: "g-test", chatId: "chat-a" as string | undefined,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  getContext: () => mockContext,
  saveOpenChat: async () => { await (mockContext).saveMetadata?.(); return { ok: true as const, chatId: "" }; },
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
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(() => ({ close: () => undefined })),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) mockHandlers.set(entry.eventName, entry.handler);
    return () => mockHandlers.clear();
  },
}));

jest.mock("./effectHost", () => {
  const actual = jest.requireActual("./effectHost");
  return {
    ...actual,
    reconcileEffectLedgerInto: jest.fn((effects: { ledger: unknown[] }, note: (text: string) => void) => {
      const { rows, notes } = mockReconcile(effects.ledger);
      effects.ledger = rows;
      notes.forEach((text) => note(text));
    }),
  };
});

let mockReconcile: (rows: unknown[]) => { rows: unknown[]; notes: string[] } = (rows) => ({ rows, notes: [] });

const story = {
  format: 2,
  id: "switch-story",
  title: "Switch story",
  description: "Two chats of one story, switched back and forth.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "The Hall", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "The Road", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};

const line = (index: number): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: `line ${index}`, send_date: `t${index}` });
const settle = () => settleTurns(20);
const emit = async (name: string, ...args: unknown[]) => { await mockHandlers.get(name)?.(...args); await settle(); };
type JournalRow = { boundary: number; messageId: number; kind: string; summary: string };
const records = (manager: RuntimeManager): JournalRow[] => (manager as unknown as { extras: { journal: JournalRow[] } }).extras.journal;

const chats = new Map<string, { chat: Row[]; metadata: { [key: string]: unknown } }>();
const open = async (id: string) => {
  if (mockContext.chatId) chats.set(mockContext.chatId, { chat: mockContext.chat, metadata: mockContext.chatMetadata });
  const next = chats.get(id) ?? { chat: [], metadata: { integrity: `i-${id}` } };
  mockContext.chatId = id;
  mockContext.chat = next.chat;
  mockContext.chatMetadata = next.metadata;
  await emit("CHAT_CHANGED");
};

beforeEach(() => {
  mockHandlers.clear();
  chats.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-chat-a" };
  mockContext.extensionSettings = {};
  mockReconcile = (rows) => ({ rows, notes: [] });
});

// T2-6 (journal.jsonl:242, :155): after a switch, the arriving chat's journal opened with the LEAVING chat's
// status line ("Following <its checkpoint>"), and the ledger notes of the load carried the leaving chat's
// boundary and message.
describe("T2-6: a chat switch writes only the arriving chat's own state into its journal", () => {
  it("records no status line naming the other chat's checkpoint, and stamps load notes with this chat's boundary", async () => {
    const manager = new RuntimeManager();
    new TurnBridge(manager, manager.chatSave).start();
    await emit("CHAT_CHANGED");
    await manager.importStory(JSON.stringify(story));
    mockContext.chat = [line(0), line(1)];
    await manager.commitBoundary();
    expect(manager.getEngineState()).toMatchObject({ activeCheckpointId: "start", boundary: 1, lastMessageId: 1 });

    await open("chat-b");
    await manager.selectStory("switch-story");
    mockContext.chat = [line(0), line(1)];
    await manager.commitBoundary();
    mockContext.chat.push(line(2), line(3));
    await manager.setQuality("go", "true");
    mockContext.chat.push(line(4), line(5));
    await manager.commitBoundary();
    expect(manager.getEngineState()).toMatchObject({ activeCheckpointId: "next", lastMessageId: 5 });
    const leaving = manager.getEngineState()!;

    mockReconcile = (rows) => { manager.notify(); return { rows, notes: ['host change "cast" was reverted when this chat reloaded'] }; };
    await open("chat-a");
    const arrived = records(manager);
    expect(manager.getEngineState()).toMatchObject({ activeCheckpointId: "start", boundary: 1, lastMessageId: 1 });
    const fresh = arrived.filter((record) => record.summary.includes("The Road") || record.summary.includes("reverted"));
    expect(fresh.filter((record) => record.kind === "status")).toEqual([]);
    const notes = arrived.filter((record) => record.summary.includes("reverted"));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ boundary: 1, messageId: 1 });
    expect(notes[0].boundary).not.toBe(leaving.boundary);
  });

  it("control: the arriving chat's own status still lands", async () => {
    const manager = new RuntimeManager();
    new TurnBridge(manager, manager.chatSave).start();
    await emit("CHAT_CHANGED");
    await manager.importStory(JSON.stringify(story));
    mockContext.chat = [line(0), line(1)];
    await manager.commitBoundary();
    await open("chat-b");
    await open("chat-a");
    const statuses = records(manager).filter((record) => record.kind === "status").map((record) => record.summary);
    expect(statuses[statuses.length - 1]).toBe("Continuing Switch story");
  });
});

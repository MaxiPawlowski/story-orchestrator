import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import { blobMismatch } from "./persistence";
import type { StoryOrchestratorMetadataBlob } from "./types";

// v2.4 plan 02 T3, on the real manager: fingerprints are written with the boundary they describe, a
// consumed message that changed with no event is stepped back from at the next boundary or hydrate,
// and an edit, swipe-delete, hide or persona rename that left the message as the story read it
// changes nothing.

interface Row { name: string; is_user: boolean; mes: string; is_system?: boolean; swipe_id?: number; send_date?: string }

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
  id: "fp-story",
  title: "Fingerprint story",
  description: "Fingerprint reconcile fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};

const line = (index: number, text = `line ${index}`): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: text, send_date: `t${index}` });

type Outcome = { seq: number; result: string; fromMessage: number | null } | null | undefined;
const lastOutcome = (manager: RuntimeManager): Outcome => (manager as unknown as { notices: { lastOutcome?: Outcome } }).notices.lastOutcome;
const blob = () => mockContext.chatMetadata.story_orchestrator as StoryOrchestratorMetadataBlob;
const journalSummaries = (manager: RuntimeManager) => (manager as unknown as { extras: { journal: Array<{ summary: string }> } }).extras.journal.map((record) => record.summary);

const settle = async () => { for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

async function playedToNext() {
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify(story));
  mockContext.chat = [line(0), line(1)];
  await manager.commitBoundary();
  mockContext.chat.push(line(2), line(3));
  await manager.setQuality("go", "true");
  expect(manager.getEngineState()).toMatchObject({ activeCheckpointId: "next", lastMessageId: 3 });
  return manager;
}

beforeEach(() => {
  mockHandlers.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-a" };
  mockContext.extensionSettings = {};
});

describe("v2.4 plan 02 T3: fingerprints travel with the boundary", () => {
  it("the commit's own save carries one hash per consumed message", async () => {
    await playedToNext();
    const saved = blob().stories["fp-story"].fingerprints;
    expect(saved).toMatchObject({ v: 1, from: 0 });
    expect(saved?.hashes).toHaveLength(4);
    expect(saved?.hashes.every((hash) => typeof hash === "string")).toBe(true);
  });
});

describe("v2.4 plan 02 T3: an eventless change is stepped back from at the next boundary", () => {
  it("a consumed message rewritten with no event rolls the story back from it", async () => {
    const manager = await playedToNext();
    mockContext.chat[2] = { ...mockContext.chat[2], mes: "rewritten by another extension" };
    mockContext.chat.push(line(4));
    await manager.commitBoundary();
    expect(lastOutcome(manager)).toMatchObject({ result: "applied", fromMessage: 2 });
    expect(manager.getEngineState()?.activeCheckpointId).toBe("start");
    expect(journalSummaries(manager)).toContain("eventless change at message 2");
  });

  it("control: a hide, a swipe_id move and a persona rename on a consumed message change nothing", async () => {
    const manager = await playedToNext();
    mockContext.chat[2] = { ...mockContext.chat[2], is_system: true, name: "Former Persona" };
    mockContext.chat[3] = { ...mockContext.chat[3], swipe_id: 1 };
    mockContext.chat.push(line(4));
    await manager.commitBoundary();
    expect(lastOutcome(manager)).toBeUndefined();
    expect(manager.getEngineState()).toMatchObject({ activeCheckpointId: "next", lastMessageId: 4 });
  });

  it("a rollback forgets what the edit changed, so the next boundary does not step back again", async () => {
    const manager = await playedToNext();
    mockContext.chat.push(line(4), line(5));
    await manager.commitBoundary();
    mockContext.chat[4] = { ...mockContext.chat[4], mes: "edited" };
    await manager.rollbackFromMessage(4);
    const after = lastOutcome(manager);
    expect(after).toMatchObject({ result: "noop", fromMessage: 4 });
    mockContext.chat.push(line(6));
    await manager.commitBoundary();
    expect(lastOutcome(manager)?.seq).toBe(after?.seq);
    expect(manager.getEngineState()?.activeCheckpointId).toBe("next");
  });
});

describe("v2.4 plan 02 T3: a hydrate reconciles against the chat it opens", () => {
  it("a chat shorter than the saved state steps back from its length", async () => {
    await playedToNext();
    mockContext.chat = mockContext.chat.slice(0, 2);
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(lastOutcome(reopened)).toMatchObject({ result: "applied", fromMessage: 2 });
    expect(reopened.getEngineState()?.activeCheckpointId).toBe("start");
  });

  it("the length check runs for a record saved without fingerprints (a v2.3 write)", async () => {
    await playedToNext();
    delete blob().stories["fp-story"].fingerprints;
    mockContext.chat = mockContext.chat.slice(0, 2);
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(lastOutcome(reopened)).toMatchObject({ result: "applied", fromMessage: 2 });
  });

  it("a hash that no longer matches on reopen steps back from that message", async () => {
    await playedToNext();
    mockContext.chat[3] = { ...mockContext.chat[3], mes: "rewritten while the story was not listening" };
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(lastOutcome(reopened)).toMatchObject({ result: "applied", fromMessage: 3 });
  });

  it("control: the same chat reopened unchanged is not rolled back", async () => {
    await playedToNext();
    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(lastOutcome(reopened)).toBeUndefined();
    expect(reopened.getEngineState()?.activeCheckpointId).toBe("next");
  });
});

describe("v2.4 plan 02 T3: mutation events against the fingerprints (TurnBridge + ChatSave)", () => {
  const bridged = async () => {
    const manager = await playedToNext();
    new TurnBridge(manager, manager.chatSave).start();
    return manager;
  };
  const emit = async (name: string, ...args: unknown[]) => { await mockHandlers.get(name)?.(...args); await settle(); };

  it("a no-op edit (H19: MESSAGE_EDITED and MESSAGE_UPDATED for unchanged text) rolls nothing back", async () => {
    const manager = await bridged();
    await emit("MESSAGE_EDITED", 2);
    await emit("MESSAGE_UPDATED", 2);
    expect(lastOutcome(manager)).toBeUndefined();
    expect(manager.getRunContext().windowRevision).toBe(0);
    expect(manager.getEngineState()?.activeCheckpointId).toBe("next");
  });

  it("control: an edit that changed the text rolls back from it", async () => {
    const manager = await bridged();
    mockContext.chat[2] = { ...mockContext.chat[2], mes: "a real edit" };
    await emit("MESSAGE_EDITED", 2);
    expect(lastOutcome(manager)).toMatchObject({ result: "applied", fromMessage: 2 });
  });

  it("an editor move names only the later row (H6), and the rollback starts at the earlier one", async () => {
    const manager = await bridged();
    [mockContext.chat[2], mockContext.chat[3]] = [mockContext.chat[3], mockContext.chat[2]];
    await emit("MESSAGE_UPDATED", 3);
    expect(lastOutcome(manager)).toMatchObject({ result: "applied", fromMessage: 2 });
    expect(journalSummaries(manager)).toContain("eventless change at message 2");
  });

  it("a continue re-hashes the message it extended, so its own boundary does not read it as changed", async () => {
    const manager = await bridged();
    const boundary = manager.getEngineState()!.boundary;
    mockContext.chat[3] = { ...mockContext.chat[3], mes: `${mockContext.chat[3].mes} and then some` };
    await emit("MESSAGE_RECEIVED", 3, "continue");
    await emit("CHARACTER_MESSAGE_RENDERED", 3, "continue");
    expect(manager.getEngineState()?.boundary).toBe(boundary + 1);
    expect(lastOutcome(manager)).toBeUndefined();
    expect(manager.getEngineState()?.activeCheckpointId).toBe("next");
    expect(manager.chatSave.unchanged(3)).toBe(true);
  });
});

describe("v2.4 plan 02 §0: a stale integrity with a matching chat id", () => {
  it("is restamped at the next own save and journaled, never read as foreign", async () => {
    const manager = await playedToNext();
    expect(blob().integrity).toBe("i-a");
    mockContext.chatMetadata.integrity = "i-b";
    mockContext.chat.push(line(4));
    await manager.commitBoundary();
    expect(blob()).toMatchObject({ chatId: "chat-a", integrity: "i-b" });
    expect(blobMismatch()).toBeNull();
    expect(manager.getSnapshot().ready).toBe(true);
    expect(journalSummaries(manager)).toContain("integrity-restamped");
  });
});

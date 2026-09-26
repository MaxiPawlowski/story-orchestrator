import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import { branchFromOldest, classifyStoredIdentity, continueFromBranch, loadAtStartup, unbindBranchMirror, type StoredIdentityInput } from "./chatIdentity";
import { beginRun } from "./runToken";
import { BLOB_VERSION } from "./persistence";
import { executeSlashCommands, unbindChatLorebook } from "@services/STAPI";
import type { StoryOrchestratorMetadataBlob } from "./types";

// v2.4 plan 02 §5 (D3, T2). A branch or checkpoint arrives carrying the parent's blob, stamped for the
// parent, plus the parent's chat lorebook slot (H1-H3). It is told apart from any other foreign blob,
// never adopted on its own, its inherited mirror binding is cleared while it waits, and Continue from
// here adopts it and steps the story back to where the branch ends.

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
  unbindChatLorebook: jest.fn(async (name: string) => {
    if (mockContext.chatMetadata.world_info !== name) return { ok: false, reason: "the slot names another book" };
    delete mockContext.chatMetadata.world_info;
    return { ok: true, name };
  }),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  vectorInsert: jest.fn(async () => undefined),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async () => true),
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

const story = {
  format: 2,
  id: "branch-story",
  title: "Branch story",
  description: "Branch fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "The Gate", objective: "Start.", type: "anchor", start: true },
    { id: "next", name: "The Road", objective: "Next.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }],
  roster: [],
};

const PARENT_BOOK = "Story Orchestrator - Branch story - chat-a";
const line = (index: number, text = `line ${index}`): Row => ({ name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: text, send_date: `t${index}` });
const settle = async () => { for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const emit = async (name: string, ...args: unknown[]) => { await mockHandlers.get(name)?.(...args); await settle(); };
type Outcome = { result: string; fromMessage: number | null } | null | undefined;
const lastOutcome = (manager: RuntimeManager): Outcome => (manager as unknown as { notices: { lastOutcome?: Outcome } }).notices.lastOutcome;
const blob = () => mockContext.chatMetadata.story_orchestrator as StoryOrchestratorMetadataBlob;
const journalSummaries = (manager: RuntimeManager) => (manager as unknown as { extras: { journal: Array<{ summary: string }> } }).extras.journal.map((record) => record.summary);

async function playedParent() {
  const manager = new RuntimeManager();
  new TurnBridge(manager, manager.chatSave).start();
  await emit("CHAT_CHANGED");
  await manager.importStory(JSON.stringify(story));
  mockContext.chat = [line(0), line(1)];
  await manager.commitBoundary();
  mockContext.chat.push(line(2), line(3));
  await manager.setQuality("go", "true");
  const record = blob().stories["branch-story"];
  record.extras.memory.wiBook = { name: PARENT_BOOK, chatId: "chat-a" };
  mockContext.chatMetadata.world_info = PARENT_BOOK;
  return manager;
}

/** What `/branch-create 1` leaves open: the parent's metadata copied whole, `main_chat` and a fresh
 *  integrity added (H1), and the chat up to the branch point. */
const openBranch = async (at = 1, id = "branch-1") => {
  const metadata = JSON.parse(JSON.stringify(mockContext.chatMetadata)) as Record<string, unknown>;
  mockContext.chatId = id;
  mockContext.chatMetadata = { ...metadata, main_chat: "chat-a", integrity: `i-${id}` };
  mockContext.chat = JSON.parse(JSON.stringify(mockContext.chat.slice(0, at + 1))) as Row[];
  await emit("CHAT_CHANGED");
};

beforeEach(() => {
  mockHandlers.clear();
  mockContext.chat = [];
  mockContext.chatId = "chat-a";
  mockContext.chatMetadata = { integrity: "i-a" };
  mockContext.extensionSettings = {};
  (unbindChatLorebook as jest.Mock).mockClear();
  (executeSlashCommands as jest.Mock).mockClear();
});

describe("v2.4 plan 02 §5: classifyStoredIdentity", () => {
  const parentBlob = { version: BLOB_VERSION, chatId: "chat-a", integrity: "i-a", selectedStoryId: "s", stories: { s: { engineState: { activeCheckpointId: "cp2" }, pinnedStory: { checkpoints: [{ id: "cp1", name: "Gate" }, { id: "cp2", name: "Road" }] }, extras: { memory: { wiBook: { name: "Book A", chatId: "chat-a" } } } } } };
  const branch: StoredIdentityInput = { openChat: "branch-1", blob: parentBlob, mainChat: "chat-a", integrity: "i-b" };

  it("a blob stamped for the chat main_chat names, under a new integrity, is a branch, named by its checkpoint", () => {
    expect(classifyStoredIdentity(branch)).toEqual({ snapshot: { kind: "branch", parentChat: "chat-a", checkpointName: "Road" }, storyId: "s", parentBook: "Book A" });
  });

  it("a blob that never carried an integrity (written before it existed) still reads as a branch", () => {
    expect(classifyStoredIdentity({ ...branch, blob: { ...parentBlob, integrity: undefined } })?.snapshot.kind).toBe("branch");
  });

  it("one hop only: a branch of an unadopted branch names the middle chat, so it is foreign", () => {
    expect(classifyStoredIdentity({ ...branch, openChat: "branch-2", mainChat: "branch-1" })?.snapshot).toEqual({ kind: "foreign", stampedFor: "chat-a" });
  });

  it("convert-to-group deletes main_chat (H4), so it is foreign", () => {
    expect(classifyStoredIdentity({ ...branch, mainChat: undefined })?.snapshot.kind).toBe("foreign");
  });

  it("a blob that carries this chat's own integrity is not a branch of it", () => {
    expect(classifyStoredIdentity({ ...branch, integrity: "i-a" })?.snapshot.kind).toBe("foreign");
  });

  it("a branch with no selected story has nothing to continue, so it is foreign", () => {
    expect(classifyStoredIdentity({ ...branch, blob: { ...parentBlob, selectedStoryId: null } })?.snapshot.kind).toBe("foreign");
  });

  it("control: this chat's own blob, and no blob, are neither", () => {
    expect(classifyStoredIdentity({ ...branch, openChat: "chat-a" })).toBeNull();
    expect(classifyStoredIdentity({ ...branch, blob: undefined })).toBeNull();
  });
});

describe("v2.4 plan 02 §5: an unadopted branch", () => {
  it("is not adopted on its own, reads as a branch on the snapshot, and loses the parent's mirror binding", async () => {
    const manager = await playedParent();
    await openBranch();
    expect(manager.getSnapshot().ready).toBe(false);
    expect(manager.getSnapshot().chatIdentity).toEqual({ kind: "branch", parentChat: "chat-a", checkpointName: "The Road" });
    expect(unbindChatLorebook).toHaveBeenCalledWith(PARENT_BOOK);
    expect(mockContext.chatMetadata.world_info).toBeUndefined();
    expect(blob().chatId).toBe("chat-a");
  });

  it("leaves a slot the player bound to another book alone", async () => {
    await playedParent();
    mockContext.chatMetadata.world_info = "My own lore";
    await openBranch();
    expect(mockContext.chatMetadata.world_info).toBe("My own lore");
  });

  it("(plan mutation 9) unbinds nothing when the run that decided it has lapsed", async () => {
    const manager = await playedParent();
    await openBranch();
    mockContext.chatMetadata.world_info = PARENT_BOOK;
    (unbindChatLorebook as jest.Mock).mockClear();
    const run = beginRun(manager.getOwnership());
    manager.invalidateRuns();
    await expect(unbindBranchMirror(run)).resolves.toBeNull();
    expect(unbindChatLorebook).not.toHaveBeenCalled();
    await expect(unbindBranchMirror(beginRun(manager.getOwnership()))).resolves.toEqual({ ok: true, name: PARENT_BOOK });
  });

  it("control: another chat's foreign blob gets no notice and keeps its slot", async () => {
    await playedParent();
    const manager = new RuntimeManager();
    new TurnBridge(manager, manager.chatSave).start();
    const metadata = JSON.parse(JSON.stringify(mockContext.chatMetadata)) as Record<string, unknown>;
    mockContext.chatId = "imported-chat";
    mockContext.chatMetadata = { ...metadata, integrity: "i-imported" };
    await emit("CHAT_CHANGED");
    expect(manager.getSnapshot().chatIdentity).toEqual({ kind: "foreign", stampedFor: "chat-a" });
    expect(unbindChatLorebook).not.toHaveBeenCalled();
    expect(mockContext.chatMetadata.world_info).toBe(PARENT_BOOK);
  });
});

// v2.4 E5: the page's first load is not a CHAT_CHANGED, so it never reached the bridge's unbind. A branch
// opened by reloading the page kept the parent's chat lorebook bound; the same branch opened by a switch
// did not. The startup load now runs the same classification and unbind.
describe("v2.4 E5: an unadopted branch opened by the first page load", () => {
  const reloadPage = () => {
    mockHandlers.clear();
    (unbindChatLorebook as jest.Mock).mockClear();
    return new RuntimeManager();
  };
  const startupLoad = (manager: RuntimeManager) => loadAtStartup({ load: () => manager.loadSelectedFromChat(), ownership: () => manager.getOwnership() });
  const landOnBranch = (at = 1, id = "branch-1") => {
    const metadata = JSON.parse(JSON.stringify(mockContext.chatMetadata)) as Record<string, unknown>;
    mockContext.chatId = id;
    mockContext.chatMetadata = { ...metadata, main_chat: "chat-a", integrity: `i-${id}` };
    mockContext.chat = JSON.parse(JSON.stringify(mockContext.chat.slice(0, at + 1))) as Row[];
  };

  it("loses the parent's mirror binding, exactly as a switch onto it does", async () => {
    await playedParent();
    landOnBranch();
    const reloaded = reloadPage();
    await expect(startupLoad(reloaded)).resolves.toEqual({ ok: true, name: PARENT_BOOK });
    expect(unbindChatLorebook).toHaveBeenCalledWith(PARENT_BOOK);
    expect(mockContext.chatMetadata.world_info).toBeUndefined();
    expect(reloaded.getSnapshot().chatIdentity).toEqual({ kind: "branch", parentChat: "chat-a", checkpointName: "The Road" });
    expect(blob().chatId).toBe("chat-a");
  });

  it("control: the parent chat reloaded keeps its binding", async () => {
    await playedParent();
    const reloaded = reloadPage();
    await expect(startupLoad(reloaded)).resolves.toBeNull();
    expect(unbindChatLorebook).not.toHaveBeenCalled();
    expect(mockContext.chatMetadata.world_info).toBe(PARENT_BOOK);
    expect(reloaded.getSnapshot().ready).toBe(true);
  });

  it("control: an adopted branch reloaded keeps its binding", async () => {
    const manager = await playedParent();
    await openBranch(1);
    await continueFromBranch({ selectStory: (id) => manager.selectStory(id), note: jest.fn() });
    const own = "Story Orchestrator - Branch story - branch-1";
    mockContext.chatMetadata.world_info = own;
    const reloaded = reloadPage();
    await expect(startupLoad(reloaded)).resolves.toBeNull();
    expect(unbindChatLorebook).not.toHaveBeenCalled();
    expect(mockContext.chatMetadata.world_info).toBe(own);
  });
});

describe("v2.4 plan 02 §5: Continue from here", () => {
  it("adopts the branch, hydrates, and steps the story back to where the branch ends", async () => {
    const manager = await playedParent();
    await openBranch(1);
    const note = jest.fn();
    await expect(continueFromBranch({ selectStory: (id) => manager.selectStory(id), note })).resolves.toBe(true);
    expect(blob()).toMatchObject({ chatId: "branch-1", integrity: "i-branch-1" });
    expect(lastOutcome(manager)).toMatchObject({ result: "applied", fromMessage: 2 });
    expect(manager.getEngineState()).toMatchObject({ activeCheckpointId: "start", lastMessageId: 1 });
    expect(manager.getSnapshot()).toMatchObject({ ready: true, chatIdentity: null });
    expect(note).toHaveBeenCalledWith("branch continued", expect.stringContaining("chat-a"));
  });

  it("a swipe-branch steps back from the first message that differs", async () => {
    const manager = await playedParent();
    const metadata = JSON.parse(JSON.stringify(mockContext.chatMetadata)) as Record<string, unknown>;
    mockContext.chatId = "branch-s";
    mockContext.chatMetadata = { ...metadata, main_chat: "chat-a", integrity: "i-s" };
    mockContext.chat = [line(0), line(1), line(2, "the other swipe"), line(3)];
    await emit("CHAT_CHANGED");
    await continueFromBranch({ selectStory: (id) => manager.selectStory(id), note: jest.fn() });
    expect(lastOutcome(manager)).toMatchObject({ result: "applied", fromMessage: 2 });
  });

  it("control: a foreign blob is never continued", async () => {
    await playedParent();
    const manager = new RuntimeManager();
    const metadata = JSON.parse(JSON.stringify(mockContext.chatMetadata)) as Record<string, unknown>;
    mockContext.chatId = "imported-chat";
    mockContext.chatMetadata = { ...metadata, integrity: "i-imported" };
    const selectStory = jest.fn(async () => true);
    await expect(continueFromBranch({ selectStory, note: jest.fn() })).resolves.toBe(false);
    expect(selectStory).not.toHaveBeenCalled();
    expect(blob().chatId).toBe("chat-a");
    expect(manager.getSnapshot().ready).toBe(false);
  });
});

describe("v2.4 plan 02 §5 (seed D out of horizon): branch from the oldest restorable point", () => {
  it("cuts the branch at the floor, and its Continue restores the floor exactly", async () => {
    const manager = await playedParent();
    const record = blob().stories["branch-story"];
    const history = record.engineHistory!;
    const floor = history.log[0].after;
    record.engineHistory = { from: { boundary: floor.boundary, messageId: floor.lastMessageId }, base: floor, log: history.log.slice(1) };
    const reopened = new RuntimeManager();
    new TurnBridge(reopened, reopened.chatSave).start();
    await emit("CHAT_CHANGED");
    await reopened.rollbackFromMessage(0);
    const unavailable = reopened.getSnapshot().rollbackUnavailable;
    expect(unavailable?.oldest).toEqual({ boundary: 1, messageId: 1 });
    await expect(branchFromOldest(unavailable!.oldest.messageId)).resolves.toEqual({ ok: true });
    expect(executeSlashCommands).toHaveBeenCalledWith("/branch-create 1");
    await openBranch(1, "floor-branch");
    await continueFromBranch({ selectStory: (id) => reopened.selectStory(id), note: jest.fn() });
    expect(reopened.getEngineState()).toMatchObject({ boundary: floor.boundary, lastMessageId: floor.lastMessageId, activeCheckpointId: floor.activeCheckpointId, blackboard: floor.blackboard });
  });

  it("refuses a floor with no message to branch at", async () => {
    await expect(branchFromOldest(-1)).resolves.toMatchObject({ ok: false });
    expect(executeSlashCommands).not.toHaveBeenCalled();
  });
});

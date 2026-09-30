const popup = { answer: true };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => globalThis.__unreadableContext,
  saveOpenChat: async () => { await (globalThis.__unreadableContext).saveMetadata?.(); return { ok: true as const, chatId: "" }; },
  showConfirmPopup: jest.fn(async () => popup.answer),
}));
jest.mock("./storyLibrary", () => ({
  listStoryRecords: () => [],
  findStoryRecord: (id: string) => (id === "s1" ? { id: "s1", raw: {} } : null),
  loadPinnedStory: (id: string) => ({ record: { id } }),
  loadStoryRecord: (record: { id: string }) => ({ record: { id: record.id }, story: {} }),
}));

import { adoptChatState, BLOB_VERSION, blobMismatch, dropPersistedRuntime, getMetadataBlob, restampRenamedChat, savePersistedRuntime, setSelectedStoryId } from "./persistence";
import { loadSelectedStory, restartStory, selectStory, type StorySelectionDeps } from "./storySelection";
import { currentEngineState, currentRecord } from "../../test/findings/currentRecord";

declare global {
  // eslint-disable-next-line no-var
  var __unreadableContext: { chatId: string; chatMetadata: Record<string, unknown>; saveMetadata: jest.Mock };
}

const record = (id: string) => currentRecord(id) as never;

const SHAPES: Array<[string, () => unknown, number | string | null]> = [
  ["a v7 blob from another build", () => ({ version: 7, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: { storyId: "s1", journal: ["kept"] } }, fingerprints: { v: 1 } }), 7],
  ["a v5 blob, the format before v6", () => ({ version: 5, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: record("s1") } }), 5],
  ["a v4 blob", () => ({ version: 4, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: record("s1") } }), 4],
  ["a v3 blob", () => ({ version: 3, selectedStoryId: "s1", stories: { s1: record("s1") } }), 3],
  ["a v2 blob", () => ({ version: 2, selectedStoryHash: "v2-abc", stories: { "v2-abc": { storyHash: "v2-abc" } } }), 2],
  ["a string version \"6\"", () => ({ version: "6", chatId: "chat-a", selectedStoryId: "s1", stories: { s1: {} } }), "6"],
  ["a blob with no version", () => ({ chatId: "chat-a", selectedStoryId: "s1", stories: { s1: {} } }), null],
  ["a v6 blob whose stories is not a record", () => ({ version: 6, chatId: "chat-a", selectedStoryId: "s1", stories: ["s1"] }), 6],
  ["a v6 blob whose record lacks engineHistory", () => ({ version: 6, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: currentRecord("s1", { engineHistory: undefined }) } }), 6],
  ["a v6 blob whose engine state lacks visitedPath", () => ({ version: 6, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: currentRecord("s1", { engineState: currentEngineState({ visitedPath: undefined }) }) } }), 6],
  ["a v6 blob whose record lacks pinnedStory", () => ({ version: 6, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: currentRecord("s1", { pinnedStory: null }) } }), 6],
  ["a v6 blob whose engine state has a null lastMessageId", () => ({ version: 6, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: currentRecord("s1", { engineState: currentEngineState({ lastMessageId: null as never }) }) } }), 6],
  ["a v6 blob whose unselected record lacks extras", () => ({ version: 6, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: currentRecord("s1"), s2: currentRecord("s2", { extras: undefined }) } }), 6],
];

function open(blob: unknown, chatId = "chat-a") {
  globalThis.__unreadableContext = { chatId, chatMetadata: { story_orchestrator: blob, integrity: "i-1" }, saveMetadata: jest.fn() };
}
const bytes = () => JSON.stringify(globalThis.__unreadableContext.chatMetadata);
const stored = () => globalThis.__unreadableContext.chatMetadata.story_orchestrator as Record<string, unknown>;

function deps() {
  return {
    loadStory: jest.fn(async () => undefined),
    clearStory: jest.fn(async () => undefined),
    setStatus: jest.fn(),
    fail: jest.fn(),
    loadedFallback: () => null,
  };
}

beforeEach(() => {
  popup.answer = true;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("T11: a blob this build cannot read is read detached and never overwritten", () => {
  it.each(SHAPES)("%s: every read and every automatic write leaves chat_metadata byte-identical, and the load journals blob-unreadable", async (_label, shape, foundVersion) => {
    open(shape());
    const before = bytes();
    expect(getMetadataBlob()).toEqual({ version: BLOB_VERSION, chatId: "chat-a", selectedStoryId: null, stories: {} });
    expect(blobMismatch()).toEqual({ kind: "unreadable", foundVersion, openChat: "chat-a" });
    expect(savePersistedRuntime(record("s2"))).toEqual([]);
    setSelectedStoryId("s2");
    dropPersistedRuntime("s1");
    expect(restampRenamedChat("chat-a.jsonl", "chat-a.jsonl")).toBe(false);
    const d = deps();
    expect(await loadSelectedStory(d as unknown as StorySelectionDeps)).toBe(false);
    expect(d.clearStory).toHaveBeenCalledWith(expect.stringContaining("Restart to replace it"), expect.stringMatching(/^blob-unreadable: /));
    expect(bytes()).toBe(before);
    expect(globalThis.__unreadableContext.saveMetadata).not.toHaveBeenCalled();
  });

  it("an explicit selection is refused, says another version saved it, adopts nothing, and is the story a confirmed Restart then starts", async () => {
    open(SHAPES[5][1]());
    const other = deps();
    expect(await selectStory(other as unknown as StorySelectionDeps, "s1")).toBe(false);
    expect(other.setStatus).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('version "6"'));
    open(SHAPES[2][1]());
    const before = bytes();
    expect(adoptChatState()).toBe(false);
    const d = deps();
    expect(await selectStory(d as unknown as StorySelectionDeps, "s1")).toBe(false);
    expect(d.loadStory).not.toHaveBeenCalled();
    expect(d.setStatus).toHaveBeenCalledWith("Story not selected: this chat's saved story state was saved by another version of Story Orchestrator: Restart to replace it", expect.stringMatching(/^blob-unreadable: selecting 's1' refused, unreadable by this build \(version 4\)/));
    expect(bytes()).toBe(before);
    expect(await restartStory(d as unknown as StorySelectionDeps, null)).toBe(true);
    expect(d.loadStory).toHaveBeenCalledWith(expect.objectContaining({ record: { id: "s1" } }), "activate");
    expect(d.setStatus).toHaveBeenLastCalledWith("Story restarted", expect.stringMatching(/^blob-unreadable: replaced on a confirmed Restart/));
  });

  it("Restart overwrites nothing until it is confirmed", async () => {
    open(SHAPES[0][1]());
    const before = bytes();
    popup.answer = false;
    expect(await restartStory(deps() as unknown as StorySelectionDeps, null)).toBe(false);
    expect(bytes()).toBe(before);
    expect(globalThis.__unreadableContext.saveMetadata).not.toHaveBeenCalled();
  });

  it("a confirmed Restart replaces it with a fresh blob and journals it", async () => {
    open(SHAPES[0][1]());
    const d = deps();
    expect(await restartStory(d as unknown as StorySelectionDeps, null)).toBe(true);
    expect(stored()).toEqual({ version: BLOB_VERSION, chatId: "chat-a", selectedStoryId: null, stories: {} });
    expect(globalThis.__unreadableContext.chatMetadata.integrity).toBe("i-1");
    expect(globalThis.__unreadableContext.saveMetadata).toHaveBeenCalled();
    expect(d.setStatus).toHaveBeenLastCalledWith("Unreadable story state replaced", expect.stringMatching(/^blob-unreadable: replaced on a confirmed Restart/));
    getMetadataBlob();
    expect(blobMismatch()).toBeNull();
  });

  it("control: a well-shaped v5 blob is read and adopted", () => {
    open({ version: BLOB_VERSION, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: record("s1") } });
    expect(getMetadataBlob().selectedStoryId).toBe("s1");
    expect(blobMismatch()).toBeNull();
    expect(adoptChatState()).toBe(true);
  });
});

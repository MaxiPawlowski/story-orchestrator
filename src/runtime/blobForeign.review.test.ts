jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => globalThis.__foreignContext,
  showConfirmPopup: async () => true,
}));
jest.mock("./storyLibrary", () => ({ listStoryRecords: () => [], findStoryRecord: () => null, loadPinnedStory: (id: string) => ({ record: { id } }) }));

import { adoptChatState, blobMismatch, dropPersistedRuntime, getMetadataBlob, loadPersistedRuntime, restampRenamedChat, savePersistedRuntime, setSelectedStoryId } from "./persistence";
import { loadSelectedStory, selectStory, type StorySelectionDeps } from "./storySelection";
import { finding } from "../../test/findings/ledger";

declare global {
  // eslint-disable-next-line no-var
  var __foreignContext: { chatId: string; chatMetadata: Record<string, unknown>; saveMetadata: jest.Mock };
}

const story = (id: string) => ({ storyId: id, storyTitle: "S", pinnedStory: null, playedVersion: 1, contentHashAtLoad: "h", engineState: null, extras: {} }) as never;
const chatA = () => ({ version: 4, chatId: "chat-a", selectedStoryId: "s1", stories: { s1: story("s1") } });

function open(chatId: string, blob: unknown) {
  globalThis.__foreignContext = { chatId, chatMetadata: { story_orchestrator: blob }, saveMetadata: jest.fn() };
}
const stored = () => globalThis.__foreignContext.chatMetadata.story_orchestrator as ReturnType<typeof chatA>;

describe("V5: a blob stamped for another chat is left exactly as it was", () => {
  // S3: the away recap fired in a brand-new chat because this blob was adopted as the new chat's.
  finding("S3", () => {
    open("chat-b", chatA());
    expect(getMetadataBlob().selectedStoryId).toBeNull();
    expect(stored()).toEqual(chatA());
    expect(blobMismatch()).toEqual({ stampedFor: "chat-a", openChat: "chat-b" });
  });

  it("automatic writes into it are refused", () => {
    open("chat-b", chatA());
    expect(savePersistedRuntime(story("s2"))).toEqual([]);
    setSelectedStoryId(null);
    dropPersistedRuntime("s1");
    expect(stored()).toEqual(chatA());
    expect(globalThis.__foreignContext.saveMetadata).not.toHaveBeenCalled();
  });

  it("control: the chat it belongs to reads and writes it normally", () => {
    open("chat-a", chatA());
    expect(loadPersistedRuntime("s1")).not.toBeNull();
    savePersistedRuntime(story("s2"));
    expect(Object.keys(stored().stories).sort()).toEqual(["s1", "s2"]);
    expect(blobMismatch()).toBeNull();
  });

  it("an explicit choice in the open chat adopts it, stories and all", () => {
    open("chat-b", chatA());
    adoptChatState();
    expect(stored().chatId).toBe("chat-b");
    expect(loadPersistedRuntime("s1")).not.toBeNull();
    expect(blobMismatch()).toBeNull();
  });

  it("a rename re-stamps the chat's own blob, so its story survives", () => {
    open("chat-a renamed", chatA());
    expect(restampRenamedChat("chat-a.jsonl", "chat-a renamed.jsonl")).toBe(true);
    expect(stored().chatId).toBe("chat-a renamed");
    expect(getMetadataBlob().selectedStoryId).toBe("s1");
    expect(globalThis.__foreignContext.saveMetadata).toHaveBeenCalledTimes(1);
  });

  it("control: a rename of some OTHER chat, or from a name the blob does not carry, re-stamps nothing", () => {
    open("chat-b", chatA());
    expect(restampRenamedChat("chat-a.jsonl", "elsewhere.jsonl")).toBe(false);
    expect(restampRenamedChat("chat-z.jsonl", "chat-b.jsonl")).toBe(false);
    expect(stored()).toEqual(chatA());
  });

  it("choosing a story in the open chat continues the run the adopted blob holds, rather than restarting it", async () => {
    open("chat-b", { ...chatA(), stories: { s1: { ...(story("s1") as object), pinnedStory: { title: "S" } } } });
    const loadStory = jest.fn(async () => undefined);
    expect(await selectStory({ loadStory } as unknown as StorySelectionDeps, "s1")).toBe(true);
    expect(loadStory).toHaveBeenCalledWith(expect.anything(), "hydrate", expect.objectContaining({ storyId: "s1" }));
    expect(stored().chatId).toBe("chat-b");
  });

  it("loading the chat journals the mismatch instead of only warning", async () => {
    open("chat-b", chatA());
    const clearStory = jest.fn(async () => undefined);
    const loaded = await loadSelectedStory({ clearStory } as unknown as StorySelectionDeps);
    expect(loaded).toBe(false);
    expect(clearStory).toHaveBeenCalledWith(expect.stringContaining("stamped for another chat"), expect.stringContaining("blob-chat-mismatch: stamped for chat-a, open chat is chat-b"));
    expect(stored()).toEqual(chatA());
  });
});

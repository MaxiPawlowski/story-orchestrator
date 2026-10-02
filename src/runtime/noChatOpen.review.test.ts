const host = { chatOpen: false, popups: 0 };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  showConfirmPopup: async () => { host.popups += 1; return true; },
}));
jest.mock("./persistence", () => ({
  adoptChatState: jest.fn(() => true),
  unreadableStored: () => null,
  blobMismatch: () => null,
  dropPersistedRuntime: jest.fn(),
  getSelectedStoryId: () => "ruins",
  hasOpenChat: () => host.chatOpen,
  loadPersistedRuntime: () => null,
  setSelectedStoryId: jest.fn(),
}));
jest.mock("./storyLibrary", () => ({
  findStoryRecord: () => ({ id: "ruins", title: "The Ruins", version: 3, raw: {} }),
  listStoryRecords: () => [],
  loadPinnedStory: () => null,
  loadStoryRecord: () => ({ record: { id: "ruins", title: "The Ruins", version: 3 }, story: { qualities: [], checkpoints: [] } }),
  removeStoryRecord: () => true,
  saveStoryRecord: jest.fn(() => ({ record: { id: "ruins", title: "The Ruins", version: 3 }, story: { qualities: [], checkpoints: [] } })),
}));

import { dropPersistedRuntime } from "./persistence";
import { saveStoryRecord } from "./storyLibrary";
import { importStoryJson, NO_CHAT_STATUS, restartStory, selectStory, type StorySelectionDeps } from "./storySelection";
import { NO_CHAT_NOTICE, noChatView } from "./noChat";

const harness = () => {
  const deps = {
    loadStory: jest.fn(async () => undefined),
    restoreEffects: jest.fn(async () => undefined),
    clearStory: jest.fn(async () => undefined),
    beginRun: () => ({ stillOwns: () => true, lapsed: () => false, lapsedDetail: () => null }),
    fail: jest.fn(),
    warn: jest.fn(),
    setStatus: jest.fn(),
    isLoaded: () => false,
    loadedFallback: () => ({ record: { id: "ruins", version: 3 }, story: {} }),
  };
  return { deps, selection: deps as unknown as StorySelectionDeps };
};

beforeEach(() => {
  jest.clearAllMocks();
  host.chatOpen = false;
  host.popups = 0;
});

describe("2026-10-02: a story is never activated without a chat that owns its effects", () => {
  it("an import on the welcome screen saves to the library and loads nothing", async () => {
    const h = harness();
    expect(await importStoryJson(h.selection, "{}")).toBe(false);
    expect(saveStoryRecord).toHaveBeenCalledTimes(1);
    expect(h.deps.loadStory).not.toHaveBeenCalled();
    expect(h.deps.restoreEffects).not.toHaveBeenCalled();
    expect(h.deps.setStatus).toHaveBeenCalledWith("Saved “The Ruins” v3 to the library. Open a chat to play it.");
    expect(noChatView(false)).toEqual({ notice: "Saved “The Ruins” v3 to the library. Open a chat to play it." });
    expect(noChatView(true)).toBeNull();
    expect(h.deps.fail).not.toHaveBeenCalled();
  });

  it("choosing a library story on the welcome screen is refused the same way", async () => {
    const h = harness();
    expect(await selectStory(h.selection, "ruins")).toBe(false);
    expect(h.deps.loadStory).not.toHaveBeenCalled();
    expect(h.deps.setStatus).toHaveBeenCalledWith(NO_CHAT_STATUS, expect.stringContaining("no chat is open"));
  });

  it("restart on the welcome screen asks nothing and drops nothing", async () => {
    const h = harness();
    expect(await restartStory(h.selection, "ruins", true)).toBe(false);
    expect(await restartStory(h.selection, "ruins")).toBe(false);
    expect(host.popups).toBe(0);
    expect(dropPersistedRuntime).not.toHaveBeenCalled();
    expect(h.deps.restoreEffects).not.toHaveBeenCalled();
    expect(h.deps.loadStory).not.toHaveBeenCalled();
  });

  it("control: with a chat open the same import saves and plays", async () => {
    const h = harness();
    host.chatOpen = true;
    expect(await importStoryJson(h.selection, "{}")).toBe(true);
    expect(h.deps.loadStory).toHaveBeenCalledTimes(1);
    expect(h.deps.setStatus).not.toHaveBeenCalled();
  });

  it("control: with a chat open a restart drops the progress and reloads", async () => {
    const h = harness();
    host.chatOpen = true;
    expect(await restartStory(h.selection, "ruins", true)).toBe(true);
    expect(dropPersistedRuntime).toHaveBeenCalledWith("ruins");
    expect(h.deps.loadStory).toHaveBeenCalledTimes(1);
  });
});

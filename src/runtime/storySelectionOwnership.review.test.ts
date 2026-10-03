const popup = { answer: null as null | (() => Promise<boolean>) };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  showConfirmPopup: () => popup.answer!(),
}));
jest.mock("./persistence", () => ({
  adoptChatState: jest.fn(() => true),
  unreadableStored: () => null,
  blobMismatch: () => null,
  dropPersistedRuntime: jest.fn(),
  hasOpenChat: () => true,
  hasOpenGroup: () => true,
  openChatId: () => "chat-a",
  getSelectedStoryId: () => "s1",
  loadPersistedRuntime: () => null,
  setSelectedStoryId: jest.fn(),
}));
jest.mock("./storyLibrary", () => ({
  findStoryRecord: () => ({ id: "s1", raw: {} }),
  listStoryRecords: () => [],
  loadPinnedStory: () => null,
  loadStoryRecord: () => ({ record: { id: "s1" }, story: {} }),
  removeStoryRecord: () => true,
  saveStoryRecord: () => null,
}));

import { dropPersistedRuntime } from "./persistence";
import { restartStory, type StorySelectionDeps } from "./storySelection";

function harness() {
  let owned = true;
  const loadStory = jest.fn(async () => undefined);
  const restoreEffects = jest.fn(async () => undefined);
  const deps = {
    loadStory,
    restoreEffects,
    beginRun: () => ({ stillOwns: () => owned, lapsed: () => !owned, lapsedDetail: () => (owned ? null : "moved") }),
    loadedFallback: () => null,
    setStatus: jest.fn(),
  } as unknown as StorySelectionDeps;
  return { deps, loadStory, restoreEffects, move: () => { owned = false; } };
}

beforeEach(() => jest.clearAllMocks());

describe("V3: a restart confirmed after the chat moved restarts nothing", () => {
  it("the player switches chats while the confirmation is open", async () => {
    const h = harness();
    popup.answer = async () => { h.move(); return true; };
    expect(await restartStory(h.deps, "s1")).toBe(false);
    expect(dropPersistedRuntime).not.toHaveBeenCalled();
    expect(h.restoreEffects).not.toHaveBeenCalled();
    expect(h.loadStory).not.toHaveBeenCalled();
  });

  it("the chat moves during the restart's own restore", async () => {
    const h = harness();
    popup.answer = async () => true;
    h.restoreEffects.mockImplementationOnce(async () => { h.move(); });
    expect(await restartStory(h.deps, "s1")).toBe(false);
    expect(dropPersistedRuntime).not.toHaveBeenCalled();
    expect(h.loadStory).not.toHaveBeenCalled();
  });

  it("control: a restart confirmed in its own chat drops the progress and reloads", async () => {
    const h = harness();
    popup.answer = async () => true;
    expect(await restartStory(h.deps, "s1")).toBe(true);
    expect(dropPersistedRuntime).toHaveBeenCalledWith("s1");
    expect(h.loadStory).toHaveBeenCalledTimes(1);
  });
});

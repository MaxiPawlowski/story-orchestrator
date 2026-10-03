const host = { chatOpen: true, groupOpen: false, popups: 0, selected: null as string | null };

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
  getSelectedStoryId: () => host.selected,
  hasOpenChat: () => host.chatOpen,
  hasOpenGroup: () => host.groupOpen,
  openChatId: () => (host.chatOpen ? "Ann - 1" : null),
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
import { importStoryJson, loadSelectedStory, restartStory, selectStory, type StorySelectionDeps } from "./storySelection";
import { NO_GROUP_NOTICE, NO_GROUP_STATUS, noGroupView, noteRefusedForGroup, refusedForGroup } from "./noGroup";
import { runCheck, STORY_NEEDS_GROUP_CHECK, STORY_NEEDS_GROUP_PLAYER } from "./checks";
import { repairSteps, viewerRepairStep } from "./repair";
import type { RuntimeSnapshot } from "./types";

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
  host.chatOpen = true;
  host.groupOpen = false;
  host.popups = 0;
  host.selected = null;
  noteRefusedForGroup(null, "");
});

describe("v2.7 plan 03: no group, no story", () => {
  it("choosing a story in a one-on-one chat is refused and remembered for the make-a-group card", async () => {
    const h = harness();
    expect(await selectStory(h.selection, "ruins")).toBe(false);
    expect(h.deps.loadStory).not.toHaveBeenCalled();
    expect(h.deps.restoreEffects).not.toHaveBeenCalled();
    expect(h.deps.setStatus).toHaveBeenCalledWith(NO_GROUP_STATUS, expect.stringContaining("not a group chat"));
    expect(refusedForGroup("Ann - 1")).toBe("ruins");
    expect(refusedForGroup("Bob - 1")).toBeNull();
  });

  it("an import in a one-on-one chat saves to the library and loads nothing", async () => {
    const h = harness();
    expect(await importStoryJson(h.selection, "{}")).toBe(false);
    expect(saveStoryRecord).toHaveBeenCalledTimes(1);
    expect(h.deps.loadStory).not.toHaveBeenCalled();
    expect(h.deps.setStatus).toHaveBeenCalledWith(`Saved “The Ruins” v3 to the library. ${NO_GROUP_STATUS}.`, expect.any(String));
  });

  it("restart in a one-on-one chat asks nothing and drops nothing", async () => {
    const h = harness();
    expect(await restartStory(h.selection, "ruins", true)).toBe(false);
    expect(await restartStory(h.selection, "ruins")).toBe(false);
    expect(host.popups).toBe(0);
    expect(dropPersistedRuntime).not.toHaveBeenCalled();
    expect(h.deps.loadStory).not.toHaveBeenCalled();
  });

  it("opening a one-on-one chat that holds a legacy story restores effects, clears the runtime and loads nothing", async () => {
    const h = harness();
    host.selected = "ruins";
    expect(await loadSelectedStory(h.selection)).toBe(false);
    expect(h.deps.restoreEffects).toHaveBeenCalledWith("leave");
    expect(h.deps.clearStory).toHaveBeenCalledWith(NO_GROUP_STATUS);
    expect(h.deps.loadStory).not.toHaveBeenCalled();
  });

  it("control: in a group chat the same calls play", async () => {
    const h = harness();
    host.groupOpen = true;
    expect(await selectStory(h.selection, "ruins")).toBe(true);
    expect(await importStoryJson(h.selection, "{}")).toBe(true);
    expect(await restartStory(h.selection, "ruins", true)).toBe(true);
    expect(h.deps.loadStory).toHaveBeenCalledTimes(3);
    expect(dropPersistedRuntime).toHaveBeenCalledWith("ruins");
  });
});

describe("v2.7 plan 03: the no-group view and the engine-free check", () => {
  const titleOf = (id: string) => (id === "ruins" ? "The Ruins" : null);
  const view = (overrides: Partial<Parameters<typeof noGroupView>[0]> = {}) =>
    noGroupView({ chatOpen: true, groupOpen: false, chatId: "Ann - 1", selectedStoryId: null, titleOf, ...overrides });

  it("an ordinary one-on-one chat with no story stays quiet", () => {
    expect(view()).toBeNull();
  });

  it("a one-on-one chat holding a story, or refused one, names it", () => {
    expect(view({ selectedStoryId: "ruins" })).toEqual({ notice: NO_GROUP_NOTICE, storyId: "ruins", storyTitle: "The Ruins" });
    noteRefusedForGroup("Ann - 1", "ruins");
    expect(view()?.storyId).toBe("ruins");
    expect(view({ chatId: "Bob - 1" })).toBeNull();
  });

  it("a group chat or no chat at all is never a no-group view", () => {
    expect(view({ groupOpen: true, selectedStoryId: "ruins" })).toBeNull();
    expect(view({ chatOpen: false, selectedStoryId: "ruins" })).toBeNull();
  });

  const snapshot = (noGroup: RuntimeSnapshot["noGroup"]) => ({
    storyId: null, noGroup, ui: { authorView: false }, extraction: { settings: { enabled: true, profileId: "p" } },
  }) as unknown as RuntimeSnapshot;

  it("story-needs-group runs without a loaded story and blocks; with no story selected it is silent", () => {
    const blocked = runCheck(STORY_NEEDS_GROUP_CHECK, snapshot(view({ selectedStoryId: "ruins" })));
    expect(blocked).toMatchObject({ check: "story-needs-group", severity: "blocks", player: STORY_NEEDS_GROUP_PLAYER });
    expect(blocked?.detail).toContain("The Ruins");
    expect(runCheck(STORY_NEEDS_GROUP_CHECK, snapshot(null))).toBeNull();
  });

  it("Repair leads with it, and the player sees the player line", () => {
    const solo = snapshot(view({ selectedStoryId: "ruins" }));
    expect(repairSteps(solo)[0]?.check).toBe("story-needs-group");
    expect(viewerRepairStep(solo)?.consequence).toBe(STORY_NEEDS_GROUP_PLAYER);
    expect(repairSteps(snapshot(null)).some((step) => step.check === "story-needs-group")).toBe(false);
  });
});

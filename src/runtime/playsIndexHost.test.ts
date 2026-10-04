import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow } from "@engine/index";

const root: Record<string, unknown> = {};
const host = { chatId: "chat-1", groupId: "g1", loaded: true, saved: 0 };
const selection = { storyId: null as string | null };

jest.mock("@services/STAPI", () => ({
  getContext: () => ({ chatId: host.chatId, groupId: host.groupId, extensionSettings: { "story-orchestrator": root }, saveSettingsDebounced: () => { host.saved += 1; } }),
  settingsAreLoaded: () => host.loaded,
  isHostGeneratingFlag: () => false,
  listGroupChats: () => [],
  readGroupChatMetadata: async () => null,
  subscribeToHostEvents: () => () => undefined,
}));

jest.mock("./persistence", () => ({ blobMismatch: () => null, getSelectedStoryId: () => selection.storyId }));
jest.mock("./storyLibrary", () => ({ listStoryRecords: () => [] }));
jest.mock("./settingsStore", () => ({ getGlobalSettings: () => ({ display: { presence: { listBadges: true, continueList: true, groupCard: true, chapterCard: true, wand: true, rollChips: true } } }) }));

import { forgetChatPlay, readPlaysIndex, syncOpenChatPlay, type PlaysPort } from "./playsIndexHost";

const story = parseStoryV2OrThrow(JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/chapters-mini.story.json"), "utf8")));

const port = (overrides: Partial<PlaysPort> = {}): PlaysPort => ({
  subscribe: () => () => undefined,
  loadedChatId: () => "chat-1",
  story: () => story,
  storyId: () => "chapters-mini",
  activeCheckpointId: () => "gate",
  loading: () => false,
  notify: () => undefined,
  ...overrides,
});

describe("v2.7 06 A: the plays index is written at the runtime's own notifications", () => {
  beforeEach(() => {
    Object.keys(root).forEach((key) => delete root[key]);
    Object.assign(host, { chatId: "chat-1", groupId: "g1", loaded: true, saved: 0 });
    selection.storyId = null;
  });

  it("writes the open group chat's row once, and again only when a field changes", () => {
    expect(syncOpenChatPlay(port(), "2026-10-03T00:00:00.000Z")).toBe(true);
    expect(syncOpenChatPlay(port(), "2026-10-03T00:01:00.000Z")).toBe(false);
    expect(readPlaysIndex()["chat-1"]).toMatchObject({ storyId: "chapters-mini", groupId: "g1", kind: "story", chapterTitle: "Arrival", updatedAt: "2026-10-03T00:00:00.000Z" });
    expect(syncOpenChatPlay(port({ activeCheckpointId: () => "fire" }), "2026-10-03T00:02:00.000Z")).toBe(true);
    expect(readPlaysIndex()["chat-1"]).toMatchObject({ chapterTitle: "Night Camp", updatedAt: "2026-10-03T00:02:00.000Z" });
    expect(host.saved).toBe(2);
  });

  it("writes nothing for a solo chat, or for a chat another chat's story is loaded for", () => {
    host.groupId = "";
    expect(syncOpenChatPlay(port())).toBe(false);
    host.groupId = "g1";
    expect(syncOpenChatPlay(port({ loadedChatId: () => "chat-9" }))).toBe(false);
    expect(readPlaysIndex()).toEqual({});
  });

  it("drops the row when the open chat settles with no story, never while it is still loading or selects one", () => {
    syncOpenChatPlay(port());
    const none = port({ loadedChatId: () => null, story: () => null, storyId: () => null });
    expect(syncOpenChatPlay({ ...none, loading: () => true })).toBe(false);
    selection.storyId = "chapters-mini";
    expect(syncOpenChatPlay(none)).toBe(false);
    selection.storyId = null;
    expect(syncOpenChatPlay(none)).toBe(true);
    expect(readPlaysIndex()).toEqual({});
  });

  it("drops a deleted chat's row", () => {
    syncOpenChatPlay(port());
    expect(forgetChatPlay("chat-1")).toBe(true);
    expect(forgetChatPlay("chat-1")).toBe(false);
  });

  it("never writes before SillyTavern has loaded the extension settings", () => {
    host.loaded = false;
    expect(syncOpenChatPlay(port())).toBe(false);
    expect(root.plays).toBeUndefined();
    expect(host.saved).toBe(0);
  });
});

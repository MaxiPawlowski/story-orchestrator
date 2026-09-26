import type { PersistedStoryRuntime } from "./types";
import { currentRecord } from "../../test/findings/currentRecord";

// v2.3 plan 05. A chat keeps a bounded number of story states, and the UI promises that switching
// stories preserves a run. The bound is therefore a promise about the chat's own state, and an
// eviction has to be REPORTED — a silent drop is the difference between "your run is here" and
// "your run is gone".

const metadata: Record<string, unknown> = {};
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chatId: "chat-a", chatMetadata: metadata, saveMetadata: async () => {} }),
}));

import { evictedStoryNotice, getMetadataBlob, savePersistedRuntime, STORY_STATE_RETENTION } from "./persistence";
const record = (storyId: string, updatedAt: string): PersistedStoryRuntime => currentRecord(storyId, { storyTitle: storyId, extras: { updatedAt } }) as never;

const fill = (count: number) => Array.from({ length: count }, (_, index) => record(`s${index}`, `2026-09-2${index}T00:00:00.000Z`));

beforeEach(() => { delete metadata.story_orchestrator; });
beforeEach(() => { getMetadataBlob(); });

describe("story-state retention (v2.3 plan 05)", () => {
  it("keeps the selected story plus the most recent others, and names what it dropped", () => {
    const dropped: string[] = [];
    fill(STORY_STATE_RETENTION + 2).forEach((story) => dropped.push(...savePersistedRuntime(story)));
    expect(dropped).toEqual(["s0", "s1"]);
    expect(Object.keys(getMetadataBlob().stories).sort()).toEqual(["s2", "s3", "s4", "s5", "s6"]);
  });

  it("reports nothing while it is inside the bound", () => {
    expect(fill(STORY_STATE_RETENTION).flatMap((story) => savePersistedRuntime(story))).toEqual([]);
  });

  it("never evicts the story the chat is playing", () => {
    // The chat re-enters its OLDEST story and stays there: the bound fills up around it, and the
    // story it is playing is the one thing that must not go — even though it is the oldest.
    fill(STORY_STATE_RETENTION + 1).forEach((story) => savePersistedRuntime(story));
    savePersistedRuntime(record("s0", "2026-09-20T00:00:00.000Z"));
    expect(getMetadataBlob().selectedStoryId).toBe("s0");
    fill(STORY_STATE_RETENTION + 3).forEach((story) => savePersistedRuntime(story));
    savePersistedRuntime(record("s0", "2026-09-20T00:00:00.000Z"));
    const kept = Object.keys(getMetadataBlob().stories);
    expect(kept).toContain("s0");
    expect(kept).toHaveLength(STORY_STATE_RETENTION);
  });
});

// The hop between "an id came back from the store" and "the author is told". The journal record is
// one call away from the persistence code, and a silent drop is exactly what the retention note
// exists to prevent, so the notice itself is pinned here.
describe("the eviction notice", () => {
  const titles: Record<string, string> = { "sun-ruins": "Quest for the Sun Ruins" };

  it("names the story by title, and by id when the library no longer holds it", () => {
    expect(evictedStoryNotice(["sun-ruins"], (id) => titles[id] ?? null)).toEqual({
      summary: "this chat stopped keeping progress for Quest for the Sun Ruins",
      detail: `a chat keeps progress for the ${STORY_STATE_RETENTION} most recent stories; export the state before switching if you need it`,
    });
    expect(evictedStoryNotice(["gone-story"], () => null)?.summary).toBe("this chat stopped keeping progress for gone-story");
  });

  it("says nothing when nothing was evicted", () => {
    expect(evictedStoryNotice([], () => "anything")).toBeNull();
  });

  it("names every story a single save dropped", () => {
    expect(evictedStoryNotice(["a", "b"], (id) => `T:${id}`)?.summary).toBe("this chat stopped keeping progress for T:a, T:b");
  });
});

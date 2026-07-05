import { addMemoryEntries, capTier, createMemoryState, dropByMessageId, editEntryText, excludeEntry, expireScoped, hashMemoryText, setPinned } from "./stores";
import type { MemoryEntry } from "./types";

const entry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: overrides.id ?? `id-${Math.random()}`,
  tier: "facts",
  text: "Mara trusts the player.",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: "I trust you.",
  createdAt: 1,
  messageId: 5,
  recallCount: 0,
  ...overrides,
});

describe("memory stores", () => {
  it("adds entries and returns them as accepted", () => {
    const state = createMemoryState();
    const result = addMemoryEntries(state, [entry()], { from: 0, to: 5 });
    expect(result.accepted).toHaveLength(1);
    expect(result.discarded).toHaveLength(0);
    expect(result.state.entries).toHaveLength(1);
  });

  it("drops a write fully covered by a newer completed write for the same tier+character", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "newer", text: "newer write" })], { from: 0, to: 10 }).state;
    const stale = addMemoryEntries(state, [entry({ id: "stale", text: "stale write" })], { from: 2, to: 6 });
    expect(stale.accepted).toHaveLength(0);
    expect(stale.discarded).toHaveLength(1);
    expect(stale.state.entries.map((e) => e.id)).toEqual(["newer"]);
  });

  it("does not drop a write with a wider range than any recorded write", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "first", text: "first" })], { from: 0, to: 5 }).state;
    const wider = addMemoryEntries(state, [entry({ id: "second", text: "second" })], { from: 0, to: 10 });
    expect(wider.accepted).toHaveLength(1);
    expect(wider.discarded).toHaveLength(0);
  });

  it("keeps tier+character coverage independent — a covered facts write does not block session_details", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "facts-newer", tier: "facts" })], { from: 0, to: 10 }).state;
    const sessionWrite = addMemoryEntries(state, [entry({ id: "session-stale", tier: "session_details", text: "session detail" })], { from: 2, to: 6 });
    expect(sessionWrite.accepted).toHaveLength(1);
  });

  it("drops non-pinned entries at or after a rollback messageId", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "keep", messageId: 3 }), entry({ id: "drop", messageId: 8 })], { from: 0, to: 10 }).state;
    const rolled = dropByMessageId(state, 5);
    expect(rolled.entries.map((e) => e.id)).toEqual(["keep"]);
  });

  it("keeps pinned entries across rollback even at/after the rollback messageId", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "pinned", messageId: 8, pinned: true })], { from: 0, to: 10 }).state;
    const rolled = dropByMessageId(state, 5);
    expect(rolled.entries.map((e) => e.id)).toEqual(["pinned"]);
  });

  it("expires non-pinned scene-scoped entries but keeps pinned ones", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [
      entry({ id: "scene-drop", expiration: "scene" }),
      entry({ id: "scene-pinned", expiration: "scene", pinned: true }),
      entry({ id: "permanent", expiration: "permanent" }),
    ], { from: 0, to: 10 }).state;
    const expired = expireScoped(state, "scene");
    expect(expired.entries.map((e) => e.id).sort()).toEqual(["permanent", "scene-pinned"]);
  });

  it("pins and unpins an entry by id", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "a" })], { from: 0, to: 5 }).state;
    state = setPinned(state, "a", true);
    expect(state.entries[0].pinned).toBe(true);
    state = setPinned(state, "a", false);
    expect(state.entries[0].pinned).toBe(false);
  });

  it("excludes an entry and records its content hash so it is never re-added", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "a", text: "The sky is red." })], { from: 0, to: 5 }).state;
    state = excludeEntry(state, "a");
    expect(state.entries).toHaveLength(0);
    expect(state.excluded).toEqual([hashMemoryText("The sky is red.")]);
    const reAdd = addMemoryEntries(state, [entry({ id: "b", text: "The sky is red." })], { from: 10, to: 15 });
    expect(reAdd.accepted).toHaveLength(0);
    expect(reAdd.discarded).toHaveLength(1);
  });

  it("edits an entry's text in place", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "a", text: "old text" })], { from: 0, to: 5 }).state;
    state = editEntryText(state, "a", "new text");
    expect(state.entries[0].text).toBe("new text");
  });

  it("caps a tier to its budget, keeping the most recent non-pinned entries and all pinned ones", () => {
    let state = createMemoryState();
    const many = Array.from({ length: 5 }, (_, index) => entry({ id: `e${index}`, text: `entry ${index}` }));
    state = addMemoryEntries(state, many, { from: 0, to: 5 }).state;
    state = setPinned(state, "e0", true);
    const capped = capTier(state, "facts", 3);
    expect(capped.entries.map((e) => e.id)).toEqual(["e0", "e3", "e4"]);
  });

  it("leaves a tier under budget unchanged", () => {
    let state = createMemoryState();
    state = addMemoryEntries(state, [entry({ id: "a" })], { from: 0, to: 5 }).state;
    const capped = capTier(state, "facts", 10);
    expect(capped).toBe(state);
  });
});

// v2.3 plan 03: the memory mirror already had an ownership check. It was the wrong shape and it
// asked the wrong question.
//
// `syncMemoryMirror` ended with `if (host.getChatId() !== chatId) return null;` before binding the
// lorebook and returning the state the caller writes into `extras.memory`. That is a real check,
// and it is why a chat switch mid-sync never bound one chat's book to another chat's slot.
//
// Two things were wrong with it:
//
//   1. It was hand-rolled, so the write-edge census could not see it. By this plan's own rule a
//      check has to be greppable to be auditable — otherwise the record cannot distinguish code
//      that checks from code that does not, which is the whole point of the census.
//   2. It only ever asked about the CHAT. A story swap inside the same chat passed it. The mirror
//      book is per-chat but shared across the stories played in that chat, so the previous story's
//      memory could be written to the book and then recorded in the new story's `extras`.
//
// The chat comparison is kept as-is and the token check is added beside it, so a caller that
// supplies no ownership behaves exactly as before.

import { syncMemoryMirror, type MemoryMirrorHost } from "./memoryMirror";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";
import { control } from "../../test/findings/ledger";
import { testOwnership } from "../../test/findings/testOwnership";

function harness(withOwnership = true) {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  let openChat = "chat-a";
  const bindings: string[] = [];

  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };

  const host: MemoryMirrorHost = {
    getChatId: () => openChat,
    ensureLorebook: async (name) => ({ name, created: true }),
    loadLorebook: async () => ({ entries: {} }) as never,
    upsertWIEntry: async () => "created",
    disableWIEntry: async () => ({ ok: true as const, changed: true }),
    bindChatLorebook: (name) => { bindings.push(name); return { bound: true } as never; },
    ownership: withOwnership ? ownership : testOwnership(),
  };

  return {
    host,
    bindings,
    run: () => syncMemoryMirror({
      title: "S",
      entries: [{ id: "m1", text: "Corin owes a debt", type: "relationship", tier: "facts", entities: ["Corin"] }] as never,
      writes: {},
      book: null,
    }, host),
    swapStory: () => { current = { ...current, storyId: "s2" }; },
    switchChat: () => { openChat = "chat-b"; current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
  };
}

control("an ordinary sync writes, binds and returns state", async () => {
  const h = harness();
  const result = await h.run();
  expect(result).not.toBeNull();
  expect(h.bindings).toHaveLength(1);
});

control("a chat switch mid-sync still returns null, as it always did", async () => {
  // The behaviour this function already had. It is asserted here so widening the guard cannot
  // quietly lose it.
  const h = harness();
  const pending = h.run();
  h.switchChat();
  expect(await pending).toBeNull();
  expect(h.bindings).toHaveLength(0);
});

control("a STORY SWAP inside the same chat is now caught, which the chat check let through", async () => {
  // The gap this conversion closes. The chat id never changes, so the original comparison passed
  // and the previous story's memory was bound and recorded in the new story's extras.
  const h = harness();
  const pending = h.run();
  h.swapStory();
  expect(await pending).toBeNull();
  expect(h.bindings).toHaveLength(0);
});

control("a chat switch is caught even with no ownership supplied", async () => {
  // The chat comparison is the half that carries an UNWIRED host, and dropping it survived until
  // this case existed (2026-09-20) — with ownership present the token catches the chat change too,
  // so the two halves looked redundant. They are not: one of them is the only guard most callers
  // currently have.
  const h = harness(false);
  const pending = h.run();
  h.switchChat();
  expect(await pending).toBeNull();
  expect(h.bindings).toHaveLength(0);
});

control("a host with no ownership behaves exactly as before", async () => {
  // Unwired callers must be unaffected: the chat comparison alone still decides.
  const h = harness(false);
  const pending = h.run();
  h.swapStory();
  // The story moved but this host cannot know that, so the sync completes as it always has.
  expect(await pending).not.toBeNull();
  expect(h.bindings).toHaveLength(1);
});

describe("V3: the mirror asks before EACH host write, not once after all of them", () => {
  const twoEntries = [
    { id: "m1", text: "Corin owes a debt", type: "relationship", tier: "facts", entities: ["Corin"] },
    { id: "m2", text: "Mara distrusts the guild", type: "relationship", tier: "facts", entities: ["Mara"] },
  ] as never;

  it("a story swap while the book is being ensured writes no entry into it", async () => {
    const h = harness();
    const written: string[] = [];
    h.host.ensureLorebook = async (name) => { h.swapStory(); return { name, created: true }; };
    h.host.upsertWIEntry = async (_book, comment) => { written.push(comment); return "created"; };
    expect(await syncMemoryMirror({ title: "S", entries: twoEntries, writes: {}, book: null }, h.host)).toBeNull();
    expect(written).toEqual([]);
  });

  it("a story swap during the first entry's write stops before the second", async () => {
    const h = harness();
    const written: string[] = [];
    h.host.upsertWIEntry = async (_book, comment) => { written.push(comment); h.swapStory(); return "created"; };
    expect(await syncMemoryMirror({ title: "S", entries: twoEntries, writes: {}, book: null }, h.host)).toBeNull();
    expect(written).toHaveLength(1);
  });

  it("a story swap before the stale sweep disables nothing in the book the new story now shares", async () => {
    const h = harness();
    const disabled: string[][] = [];
    h.host.ensureLorebook = async (name) => { h.swapStory(); return { name, created: false }; };
    h.host.disableWIEntry = async (_book, comments) => { disabled.push([comments].flat()); return { ok: true as const, changed: true }; };
    const book = { name: "Story Orchestrator - S - chat-a", chatId: "chat-a" };
    expect(await syncMemoryMirror({ title: "S", entries: twoEntries, writes: { so_old: "h" }, book }, h.host)).toBeNull();
    expect(disabled).toEqual([]);
  });

  it("control: both entries are written when nothing moves", async () => {
    const h = harness();
    const written: string[] = [];
    h.host.upsertWIEntry = async (_book, comment) => { written.push(comment); return "created"; };
    expect(await syncMemoryMirror({ title: "S", entries: twoEntries, writes: {}, book: null }, h.host)).not.toBeNull();
    expect(written).toHaveLength(2);
  });
});

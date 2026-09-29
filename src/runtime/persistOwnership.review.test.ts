// v2.3 plan 03: `persist()` is the chokepoint, and it had no idea which chat it was writing to.
//
// This is not a hypothetical. v2.1 plan 08 recorded the real version: a fresh group chat posts
// its greetings BEFORE `CHAT_CHANGED` (group-chats.js:300 vs 318), those greetings committed a
// boundary into the *previous* chat's loaded story, and `persist()` then wrote that story —
// selected, and one boundary further on — into the new chat's metadata, which ST had already
// swapped. Every new group chat inherited the last chat's run. That was fixed at the turn-type
// end by dropping greetings, which closes the one path anybody had found.
//
// The write edge itself stayed open. `persist()` serializes whatever the runtime holds and hands
// it to `saveMetadata`, which writes into whichever chat ST has open at that instant. Every
// coordinator `save()` ends here, so one check here covers the whole class rather than the one
// path that was noticed.
//
// The rule: a runtime hydrated for chat A never writes into chat B. It does not try to guess
// which is right — it declines and says so, and the runtime for chat B (which is the one ST is
// about to hydrate) writes its own state.

import { control, must } from "../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => globalThis.__persistTestContext }));

import { RuntimeManager } from "./runtimeManager";
import type { RunOwner } from "./runOwner";

declare global {
  // eslint-disable-next-line no-var
  var __persistTestContext: { chatId: string; saveMetadata?: () => void; chat: unknown[]; chatMetadata: Record<string, unknown>; extensionSettings: Record<string, unknown> };
}

function setChat(chatId: string) {
  globalThis.__persistTestContext = { ...globalThis.__persistTestContext, chatId };
}

beforeEach(() => {
  globalThis.__persistTestContext = { chatId: "chat-a", chat: [], chatMetadata: {}, extensionSettings: {}, saveMetadata: () => {} };
});

/**
 * The manager's private fields are the subject here: `persist` is private and only reachable
 * through a real load, which needs the whole ST host. The contract is small enough to state
 * directly — a runtime that knows its chat, and a persist that honours it.
 */
interface Probe {
  owner: RunOwner;
  persist: () => Promise<void>;
  invalidateRuns: () => void;
  loaded: unknown;
  loadedChatId: string | null;
  engine: { serialize: () => unknown; serializeHistory: () => unknown };
}

// RuntimeManager declares these private, so an intersection type collapses to never. The cast is
// the point of the probe: this test is about internals that no public API exposes.
const probe = (manager: RuntimeManager) => manager as unknown as Probe;

/** Bind a runtime to a chat the way a story load does: open the chat, then mint an epoch. */
function claim(manager: Probe, chatId: string) {
  setChat(chatId);
  manager.invalidateRuns();
}

/**
 * Enough of a loaded story that `persist` reaches its write. Without this the `!this.loaded`
 * early return stops it first and the guard is never exercised — the test then passes whether
 * the fix is there or not, which is the failure mode this whole plan exists to catch.
 */
function makeWritable(manager: Probe) {
  manager.loaded = { record: { id: "s1", version: 1, hash: "h", raw: { format: 2, id: "s1" } }, story: { title: "S" } };
  manager.loadedChatId = manager.owner.claimedChat();
  manager.engine = {
    serialize: () => ({ boundary: 1, blackboard: {}, visitedAnchors: [], visitedPath: [] }),
    serializeHistory: () => ({ from: { boundary: 1, messageId: -1 }, log: [] }),
  };
}

control("a runtime records the chat it was hydrated for", () => {
  const manager = probe(new RuntimeManager());
  // Nothing is hydrated yet, so nothing is claimed: an unbound runtime must not block the first
  // write of a chat it has not seen.
  expect(manager.owner.claimedChat()).toBeNull();
});

control("minting an epoch claims the open chat", async () => {
  // Without this, every other test here binds the runtime through `claim` and the claim itself is
  // never exercised — a mutation that stopped claiming survived exactly that gap on 2026-09-20.
  const manager = probe(new RuntimeManager());
  setChat("chat-q");
  manager.invalidateRuns();
  expect(manager.owner.claimedChat()).toBe("chat-q");

  // And the claim follows the chat: a load in another chat re-claims rather than keeping the old.
  setChat("chat-r");
  manager.invalidateRuns();
  expect(manager.owner.claimedChat()).toBe("chat-r");

  // End to end: after claiming chat-r, a write while chat-q is open is declined.
  let wrote = 0;
  globalThis.__persistTestContext.saveMetadata = () => { wrote += 1; };
  makeWritable(manager);
  setChat("chat-q");
  await manager.persist();
  expect(wrote).toBe(0);
});

control("persist declines to write a runtime hydrated for another chat", async () => {
  const manager = probe(new RuntimeManager());
  let wrote = 0;
  globalThis.__persistTestContext.saveMetadata = () => { wrote += 1; };

  claim(manager, "chat-a");
  makeWritable(manager);
  setChat("chat-b");
  await manager.persist();

  must(
    wrote === 0,
    `a runtime hydrated for chat-a wrote into chat-b (${wrote} save(s)) — this is the v2.1 plan 08 defect at its write edge, where one check covers every coordinator save() instead of the single path that was noticed`,
  );
});

control("persist writes normally when the chat has not moved", async () => {
  // The guard must not become a new way to lose a save: the ordinary path is the common one.
  const manager = probe(new RuntimeManager());
  let wrote = 0;
  globalThis.__persistTestContext.saveMetadata = () => { wrote += 1; };
  claim(manager, "chat-a");
  makeWritable(manager);
  setChat("chat-a");
  await manager.persist();
  // The count is an implementation detail (savePersistedRuntime saves too); that it wrote is not.
  expect(wrote).toBeGreaterThan(0);
});

control("a runtime that has not claimed a chat still writes", async () => {
  // An unbound runtime must not be blocked from the first write of a chat it has not seen, or
  // the guard would break the very first save of every fresh session.
  const manager = probe(new RuntimeManager());
  let wrote = 0;
  globalThis.__persistTestContext.saveMetadata = () => { wrote += 1; };
  
  makeWritable(manager);
  setChat("chat-z");
  await manager.persist();
  // The count is an implementation detail (savePersistedRuntime saves too); that it wrote is not.
  expect(wrote).toBeGreaterThan(0);
});

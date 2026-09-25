// C1 re-audit (v2.3 plan 03, 2026-09-20).
//
// C1's own title names FOUR surfaces: "a v2.2 late result (lore, scene, typed, judge ring) carries
// chat and session identity". It was closed on the judge ring alone. The other three were still
// `todo` in the write-edge census while the row read as done — the same mistake as C2, found the
// same way, by reading a closed row's wording against the code rather than trusting the row.
//
// The lore surface was worse than unfixed: it was **invisible**. The census never listed it,
// because `LoreSelector.select` writes through `force()` and `WRITE_NAME` did not include "force"
// — a verb the plan's own text names. An enumeration is only as complete as its vocabulary.
//
// This file exists so the row cannot be over-claimed again: one control per named surface.

import { LoreSelector } from "./loreSelect";
import { SceneCoordinator } from "./coordinators/sceneCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";
import { control } from "../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
}));

function world() {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  return { ownership, switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; } };
}

const story = {
  title: "S",
  lore_select: { lorebooks: ["Book"] },
  checkpointById: { cp1: { id: "cp1", name: "The Hall", objective: "Look around" } },
  qualityByKey: {},
  roster: [],
  scene_read: { locations: ["the hall", "the road"], times: ["night"] },
  outgoingByCheckpoint: {},
} as never;

const state = { activeCheckpointId: "cp1", boundary: 3, lastMessageId: 9 } as never;

// --- lore ---

control("C1/lore: a selection that outlives its chat does not force entries into the next prompt", async () => {
  const w = world();
  const forced: unknown[][] = [];
  const selector = new LoreSelector({
    judge: () => ({
      active: () => true,
      // readLore reads `e:<index>`, not `lore:<n>`. The first spelling scored nothing, so the
      // discard case passed while proving nothing (caught by the positive control).
      ask: async () => ({ answers: { "e:0": { type: "noul", noul: 0.9 } }, model: "jev" }),
    }) as never,
    getStory: () => story,
    getState: () => state,
    getWindow: () => [{ speaker: "Player", text: "We enter." }],
    getChatId: () => "chat-a",
    getLastMessageId: () => 9,
    getEntries: async () => {
      // The world moves while the host is being read — before the judge is even asked.
      w.switchChat();
      return [{ world: "Book", uid: 1, comment: "the vault", content: "A sealed vault.", disable: false, constant: false }] as never;
    },
    force: async (entries: unknown[]) => { forced.push(entries); return { ok: true as const, entries: entries.length }; },
    ownership: w.ownership,
  } as never);

  await selector.select("MESSAGE_SENT" as never);
  expect(forced).toEqual([]);
});

control("C1/lore: an ordinary selection still forces its entries", async () => {
  // The guard must not become a new way to lose lore. Without this the case above passes even if
  // `select` simply never forces anything.
  const w = world();
  const forced: unknown[][] = [];
  const selector = new LoreSelector({
    judge: () => ({ active: () => true, ask: async () => ({ answers: { "e:0": { type: "noul", noul: 0.95 } }, model: "jev" }) }) as never,
    getStory: () => story,
    getState: () => state,
    getWindow: () => [{ speaker: "Player", text: "We enter." }],
    getChatId: () => "chat-a",
    getLastMessageId: () => 9,
    getEntries: async () => [{ world: "Book", uid: 1, comment: "the vault", content: "A sealed vault.", disable: false, constant: false }] as never,
    force: async (entries: unknown[]) => { forced.push(entries); return { ok: true as const, entries: entries.length }; },
    ownership: w.ownership,
  } as never);

  await selector.select("MESSAGE_SENT" as never);
  expect(forced.length).toBe(1);
});

// --- scene ---

function sceneHarness(onAsk?: () => void) {
  const w = world();
  let scene: unknown = null;
  const coordinator = new SceneCoordinator({
    judge: () => ({
      active: () => true,
      ask: async () => {
        onAsk?.();
        return { answers: { location: { type: "choice", choice: "the road", confidence: 0.95 }, time: { type: "choice", choice: "night", confidence: 0.9 } }, model: "jev" };
      },
    }) as never,
    getStory: () => story,
    getState: () => state,
    getWindow: () => [{ speaker: "Player", text: "We walk on." }],
    getPlayerName: () => "Max",
    getLastMessageId: () => 9,
    getScene: () => scene as never,
    setScene: (next: unknown) => { scene = next; },
    inject: () => ({ ok: true as const, changed: true }),
    ownership: w.ownership,
    now: () => 0,
  } as never);
  return { coordinator, w, stored: () => scene };
}

control("C1/scene: a read that lands after a chat switch is not stored", async () => {
  // The pre-existing `getLastMessageId() !== messageId` check does not cover this: the message
  // index is the SAME, it is the chat that moved.
  const h = sceneHarness();
  h.coordinator.run({ boundary: 3, messageId: 9, heuristicFired: false, scheduleRead: () => {} } as never);
  h.w.switchChat();
  await Promise.resolve();
  await Promise.resolve();
  expect(h.stored()).toBeNull();
});

control("C1/scene: an ordinary read is stored", async () => {
  const h = sceneHarness();
  await h.coordinator.run({ boundary: 3, messageId: 9, heuristicFired: false, scheduleRead: () => {} } as never);
  expect(h.stored()).not.toBeNull();
});

// --- cleanup keyed by epoch (v2.3 plan 03 §Abort and cleanup) ---

control("C1/scene: a FAILED read that lapsed does not age another chat's tracker", async () => {
  // The failure path is a write too. A read that started in chat A and came back empty after the
  // world moved used to age whichever record is current now — so a dead backend in one chat marked
  // another chat's tracker unconfirmed, and two such misses withheld a scene never asked about.
  const w = world();
  let scene: unknown = { at: "t", boundary: 4, messageId: 9, model: "jev", facts: { location: "the hall", time: "night", present: [], headingTo: [] } };
  const coordinator = new SceneCoordinator({
    judge: () => ({ active: () => true, ask: async () => ({ answers: null, model: null, fallback: "timeout" }) }) as never,
    getStory: () => story,
    getState: () => state,
    getWindow: () => [{ speaker: "Player", text: "We walk on." }],
    getPlayerName: () => "Max",
    getLastMessageId: () => 9,
    getScene: () => scene as never,
    setScene: (next: unknown) => { scene = next; },
    inject: () => ({ ok: true as const, changed: true }),
    ownership: w.ownership,
    now: () => 0,
  } as never);

  const pending = coordinator.run({ boundary: 3, messageId: 9, heuristicFired: false, scheduleRead: () => {} } as never);
  w.switchChat();
  await pending;

  expect((scene as { freshness?: unknown }).freshness).toBeUndefined();
});

control("C1/scene: a FAILED read in its own chat still ages the tracker", async () => {
  // The behaviour C2 added, pinned so the guard above cannot quietly disable it.
  const w = world();
  let scene: unknown = { at: "t", boundary: 4, messageId: 9, model: "jev", facts: { location: "the hall", time: "night", present: [], headingTo: [] } };
  const coordinator = new SceneCoordinator({
    judge: () => ({ active: () => true, ask: async () => ({ answers: null, model: null, fallback: "timeout" }) }) as never,
    getStory: () => story,
    getState: () => state,
    getWindow: () => [{ speaker: "Player", text: "We walk on." }],
    getPlayerName: () => "Max",
    getLastMessageId: () => 9,
    getScene: () => scene as never,
    setScene: (next: unknown) => { scene = next; },
    inject: () => ({ ok: true as const, changed: true }),
    ownership: w.ownership,
    now: () => 0,
  } as never);

  await coordinator.run({ boundary: 3, messageId: 9, heuristicFired: false, scheduleRead: () => {} } as never);
  expect((scene as { freshness?: { failures: number } }).freshness?.failures).toBe(1);
});

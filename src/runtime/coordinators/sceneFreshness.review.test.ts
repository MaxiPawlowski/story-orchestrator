// C2, from the v2.2 integration review: "a failed scene read keeps the old scene live".
//
// `SceneCoordinator.run` returns `null` when the judge gives no answer — a timeout, an error, an
// unreachable plugin — without touching the stored record. `sync()` then keeps injecting it, the
// player's "At …" line keeps naming a place the story may have left, and `expansionCoordinator`
// keeps reading its `headingTo`. Nothing says the tracker is stale, so a scene read that has not
// worked for ten minutes is indistinguishable from one that answered a second ago.
//
// Owner: plan 03. v2.3 plan 01 §A writes the reproduction; plan 03 flips the row.

import type { SceneReadRecord } from "@judge/index";
import { SceneCoordinator } from "@runtime/coordinators/sceneCoordinator";
import { parseStoryV2OrThrow } from "@engine/index";
import { control, finding, must } from "../../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readBackBoundary: () => null, getContext: () => ({ chat: [], extensionSettings: {} }) }));

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "scene-freshness",
  title: "Scene freshness",
  description: "C2 fixture",
  qualities: [{ key: "moved", type: "bool", source: "extractor", rubric: "Moved?" }],
  checkpoints: [
    { id: "hall", name: "The Hall", objective: "Talk", type: "anchor", start: true },
    { id: "road", name: "The Road", objective: "Travel", type: "anchor" },
  ],
  transitions: [{ id: "go", from: "hall", to: "road", priority: 0, gate: { q: "moved", op: "==", v: true } }],
  roster: [],
  scene_read: { places: ["the hall", "the road"], times: ["day"] },
});

const answeredRecord = (): SceneReadRecord => ({
  at: "2026-09-20T00:00:00.000Z",
  boundary: 4,
  messageId: 9,
  model: "jev-1.13.0",

  // A real SceneFacts: sceneTrackerText reads every field, so a thin fake breaks the moment the
  // fix calls sync() — which is how the ledger caught this reproduction going stale.
  facts: { location: "the hall", time: "day", present: [], headingTo: [] },
});

function harness({ answers }: { answers: boolean }) {
  let scene: SceneReadRecord | null = answeredRecord();
  let injected: string | null = "At the hall";
  // The clock ADVANCES. Frozen at one value, "staleSince is the first failure" and "staleSince is
  // the latest failure" produce identical timestamps and the assertion proves nothing — which is
  // exactly what a mutation sweep caught on 2026-09-20.
  let clock = 1_000;
  const coordinator = new SceneCoordinator({
    judge: () => ({
      active: () => true,
      // No answers is what a timeout, an error or an unreachable plugin all look like here.
      ask: async () => (answers ? { answers: { location: "the road" }, model: "jev-1.13.0" } : { answers: null, model: null, fallback: "timeout" }),
    }) as never,
    getStory: story,
    getState: () => ({ activeCheckpointId: "hall", boundary: 5 }) as never,
    getWindow: () => [{ speaker: "Player", text: "I keep walking." }],
    getPlayerName: () => "Max",
    getLastMessageId: () => 10,
    getScene: () => scene,
    setScene: (next: SceneReadRecord | null) => { scene = next; },
    inject: (text: string | null) => { injected = text; },
    now: () => { clock += 60_000; return clock; },
  } as never);
  return {
    coordinator,
    get scene() { return scene; },
    get injected() { return injected; },
    clearScene: () => { scene = null; },
  };
}

control("a scene read that answers replaces the stored record", async () => {
  const h = harness({ answers: true });
  const before = h.scene;
  await h.coordinator.run({ boundary: 5, messageId: 10, heuristicFired: false, scheduleRead: () => {} } as never);
  expect(h.scene).not.toBe(before);
  expect(h.scene?.messageId).toBe(10);
});

finding("C2", async () => {
  const h = harness({ answers: false });
  // Two failures in a row: long past the point where "the last place we knew" is still a fact.
  await h.coordinator.run({ boundary: 5, messageId: 10, heuristicFired: false, scheduleRead: () => {} } as never);
  await h.coordinator.run({ boundary: 6, messageId: 11, heuristicFired: false, scheduleRead: () => {} } as never);

  const record = h.scene as (SceneReadRecord & { freshness?: { failures: number }; staleSince?: unknown }) | null;
  const aged = Boolean(record?.freshness?.failures) || record?.staleSince !== undefined;
  must(
    aged,
    `after two failed scene reads the stored record is untouched (${JSON.stringify({ failures: record?.freshness?.failures ?? null, staleSince: record?.staleSince ?? null })}) — nothing distinguishes a tracker that answered a second ago from one that has not answered in ten minutes`,
  );

  h.coordinator.sync();
  must(
    h.injected === null,
    `a scene the judge can no longer confirm is still being injected as current ("${h.injected}"), so the player's "At …" line names a place the story may have left`,
  );
});

// --- v2.3 plan 03: staleness must be precise, or it becomes a new way to lose the tracker. ---

control("one failed read does not withhold the tracker", async () => {
  // A single miss is a blip on a busy backend. Dropping the scene on the first one would make the
  // player's "At …" line flicker on every slow turn.
  const h = harness({ answers: false });
  await h.coordinator.run({ boundary: 5, messageId: 10, heuristicFired: false, scheduleRead: () => {} } as never);
  expect(h.scene?.freshness?.failures).toBe(1);
  expect(h.injected).not.toBeNull();
});

control("a failed read keeps the facts it can no longer confirm", async () => {
  // The scene is withheld from the prompt, not forgotten: an author still needs to see what the
  // last confirmed read said, and a later successful read should not start from nothing.
  const h = harness({ answers: false });
  await h.coordinator.run({ boundary: 5, messageId: 10, heuristicFired: false, scheduleRead: () => {} } as never);
  await h.coordinator.run({ boundary: 6, messageId: 11, heuristicFired: false, scheduleRead: () => {} } as never);
  expect(h.scene?.facts.location).toBe("the hall");
  expect(h.scene?.freshness?.confirmedBoundary).toBe(4);
});

control("staleSince marks the FIRST failure, not the latest", async () => {
  const h = harness({ answers: false });
  await h.coordinator.run({ boundary: 5, messageId: 10, heuristicFired: false, scheduleRead: () => {} } as never);
  const first = h.scene?.freshness?.staleSince;
  await h.coordinator.run({ boundary: 6, messageId: 11, heuristicFired: false, scheduleRead: () => {} } as never);
  expect(h.scene?.freshness?.staleSince).toBe(first);
  expect(h.scene?.freshness?.failures).toBe(2);
});

control("a failed read with no stored scene is not an error", async () => {
  const h = harness({ answers: false });
  h.clearScene();
  await expect(h.coordinator.run({ boundary: 5, messageId: 10, heuristicFired: false, scheduleRead: () => {} } as never)).resolves.toBeNull();
  expect(h.scene).toBeNull();
});

control("a late answer about an older message does not age the record", async () => {
  // Answering about a window the chat has moved past is not a judge failure: the read is simply
  // late, and the next one supersedes it. Counting it as a miss would stale the tracker on any
  // fast chat.
  const h = harness({ answers: true });
  await h.coordinator.run({ boundary: 5, messageId: 3, heuristicFired: false, scheduleRead: () => {} } as never);
  expect(h.scene?.freshness).toBeUndefined();
});

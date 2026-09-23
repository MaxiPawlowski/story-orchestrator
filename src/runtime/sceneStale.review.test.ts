// C2 follow-through (v2.3 plan 03): a scene the judge can no longer confirm must disappear from
// EVERY surface, not just the injected block.
//
// Withholding it from the prompt was the first half and shipped earlier. The rest of the system
// kept reading the same stale record: the player's "Where you are" line still named the old place,
// the look-ahead still pre-generated toward a `headingTo` computed minutes ago, and the scene
// macros still resolved to it. A tracker that is withheld from one consumer and shown by three
// others is not withheld.
//
// So staleness moved into the pure judge module, where all four consumers ask the same question.

import { buildNarrativeStatus } from "./narrative";
import { confirmedSceneFacts, isSceneStale, SCENE_STALE_AFTER, type SceneReadRecord } from "@judge/index";
import { control } from "../../test/findings/ledger";

const record = (failures: number): SceneReadRecord => ({
  at: "2026-09-20T00:00:00.000Z",
  boundary: 4,
  messageId: 9,
  model: "jev-1.13.0",
  facts: { location: "the hall", time: "night", present: ["Corin"], headingTo: ["the road"] },
  ...(failures ? { freshness: { failures, staleSince: "2026-09-20T00:01:00.000Z", confirmedBoundary: 4 } } : {}),
});

const narrative = (over: Partial<Parameters<typeof buildNarrativeStatus>[0]>) => buildNarrativeStatus({
  storyTitle: "S",
  checkpointName: "The Hall",
  objective: "Find the way down",
  lastTransition: null,
  openThreads: [],
  canon: "",
  tensionLevel: null,
  pendingCount: 0,
  pipeline: { state: "idle", text: "Idle" } as never,
  ...over,
});

const nowLines = (status: ReturnType<typeof buildNarrativeStatus>) =>
  status.sections.find((section) => section.id === "now")?.lines ?? [];

control("a fresh record is not stale and its facts are readable", () => {
  expect(isSceneStale(record(0))).toBe(false);
  expect(confirmedSceneFacts(record(0))?.location).toBe("the hall");
});

control("one failure is not enough to withhold anything", () => {
  // A single miss is a blip on a busy backend; dropping the place on the first one would make the
  // player's line flicker on every slow turn.
  expect(isSceneStale(record(1))).toBe(false);
  expect(confirmedSceneFacts(record(1))?.location).toBe("the hall");
});

control("at the threshold the facts stop being readable at all", () => {
  expect(isSceneStale(record(SCENE_STALE_AFTER))).toBe(true);
  expect(confirmedSceneFacts(record(SCENE_STALE_AFTER))).toBeNull();
});

control("the player is told the place is unsettled, not the old place", () => {
  const lines = nowLines(narrative({ sceneLocation: null, sceneUnconfirmed: true }));
  expect(lines).not.toContain("At the hall.");
  expect(lines.some((line) => line.toLowerCase().includes("somewhere"))).toBe(true);
});

control("the unsettled line never appears alongside a confirmed place", () => {
  // Both would be a contradiction on screen. A confirmed place wins.
  const lines = nowLines(narrative({ sceneLocation: "the road", sceneUnconfirmed: true }));
  expect(lines).toContain("At the road.");
  expect(lines.some((line) => line.toLowerCase().includes("somewhere"))).toBe(false);
});

control("a chat that never had a location says nothing about where it is", () => {
  // "We never knew" is not news. The line exists for "we knew and can no longer confirm it".
  const lines = nowLines(narrative({ sceneLocation: null, sceneUnconfirmed: false }));
  expect(lines.some((line) => line.toLowerCase().includes("somewhere"))).toBe(false);
});

control("player copy names no machinery", () => {
  // The spoiler/persona rule: author-grade words never reach the player surface.
  const line = nowLines(narrative({ sceneLocation: null, sceneUnconfirmed: true })).join(" ").toLowerCase();
  for (const word of ["judge", "tracker", "stale", "confidence", "boundary", "failure"]) {
    expect(line).not.toContain(word);
  }
});

// An independently authored story (from the 2026-09-18 review) played along both of its routes.
// It is the AUTHORED-branching regression: two hand-written routes to one anchor, no stub and no
// expansion. It cannot show R9 — a merge that keeps only `outcomes[0]` passes this test — so the
// generated-branching proof is a separate fixture in plan 07.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";

const raw = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/two-ways-across.story.json"), "utf8").replace(/^﻿/, ""));

test.each(["bridge", "ferry"])("the independent fixture preserves an explicit %s choice and converges", (route) => {
  const story = parseStoryV2OrThrow(raw);
  const engine = new StoryEngine();
  engine.loadStory(story);
  expect(story.outgoingByCheckpoint.bank).toHaveLength(2);

  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 0 }, deltas: [{ q: "route", v: route, source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
  expect(engine.serialize().activeCheckpointId).toBe(route);

  engine.enqueue({ source: "extractor", blackboardVersionSum: 1, turnRange: { from: 1, to: 1 }, deltas: [{ q: "arrived", v: true, source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
  expect(engine.serialize().activeCheckpointId).toBe("shore");
});

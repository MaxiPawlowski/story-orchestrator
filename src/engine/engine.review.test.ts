// Promoted from the 2026-09-18 external review. R4: hydrate drops the history rollback needs.
// E1 is rewritten as a contract test — the review asserted that rollback to boundary 0 SUCCEEDS
// after 205 boundaries, which contradicts the accepted remedy (history genuinely is not retained
// that far back). What the product owes is an explicit outcome and a recovery, never a silent
// no-op. v2.3 plan 01 §A; see test/findings/ledger.json.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { control, finding, must } from "../../test/findings/ledger";

const crossingStory = () => parseStoryV2OrThrow({
  format: 2,
  id: "review-independent",
  title: "Review crossing",
  description: "Independent fixture",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
  ],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  roster: [],
});

const stationaryStory = () => parseStoryV2OrThrow({
  format: 2,
  id: "history-review",
  title: "History review",
  description: "Long-running rollback fixture",
  qualities: [{ key: "counter", type: "int", source: "extractor", rubric: "Latest counter?" }],
  checkpoints: [{ id: "start", name: "Start", objective: "Wait", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const longHistoryEngine = (boundaries = 205) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(stationaryStory());
  for (let i = 0; i < boundaries; i += 1) {
    engine.enqueue({ source: "extractor", blackboardVersionSum: i, turnRange: { from: i, to: i }, deltas: [{ q: "counter", v: i, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: i, chatLength: i + 1 });
  }
  return engine;
};

describe("review: engine history survives persistence", () => {
  control("a live engine recognises an edit to the evidence a transition used", () => {
    const engine = new StoryEngine();
    engine.loadStory(crossingStory());
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 1 }, deltas: [{ q: "crossed", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    expect(engine.shouldRollbackFromMessage(1)).toBe(true);
  });

  finding("R4", () => {
    const engine = new StoryEngine();
    engine.loadStory(crossingStory());
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 1 }, deltas: [{ q: "crossed", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    const next = new StoryEngine();
    next.loadStory(crossingStory());
    next.hydrate(engine.serialize(), engine.serializeHistory());
    must(
      next.shouldRollbackFromMessage(1),
      "after a reload the engine no longer recognises an edit to the message a committed transition relied on: hydrate discards the boundary log and snapshots, so the edit reads as irrelevant",
    );
  });

  control("a reloaded engine can still roll back to the state before its first turn", () => {
    // The log's oldest entry describes a transition FROM a state only the base snapshot holds. With
    // the log alone, an edit to the chat's own first message had nowhere to go and reported the
    // history as gone while the run was one boundary old (found live, J6.6).
    const engine = new StoryEngine();
    engine.loadStory(crossingStory());
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    const next = new StoryEngine();
    next.loadStory(crossingStory());
    next.hydrate(engine.serialize(), engine.serializeHistory());
    expect(next.boundaryBeforeMessage(0)).toBe(0);
    expect(next.rollbackTo(0)).toEqual({ ok: true, result: "applied" });
    expect(next.historyFrom()).toEqual({ boundary: 0, messageId: -1 });
  });
});

describe("review: engine long-history behaviour", () => {
  control("a recent mutation remains rollback-capable after 205 boundaries", () => {
    const engine = longHistoryEngine();
    expect(engine.shouldRollbackFromMessage(204)).toBe(true);
    expect(engine.rollbackTo(engine.boundaryBeforeMessage(204) ?? 0)).toEqual({ ok: true, result: "applied" });
  });

  // E1's engine half. The finding itself is asserted on the runtime (rollback.review.test.ts): this test
  // used to BUILD the history-unavailable object when the engine answered null, and then assert the
  // object it had built (V11). What the engine owes is only the two signals the runtime reads.
  control("past the retained horizon the engine answers null, and a boundary it cannot reach is refused", () => {
    const engine = longHistoryEngine();
    expect(engine.shouldRollbackFromMessage(0)).toBe(true);
    expect(engine.boundaryBeforeMessage(0)).toBeNull();
    expect(engine.rollbackTo(0)).toMatchObject({ ok: false, reason: "history-unavailable" });
  });
});

describe("review: the floor a migrated chat cannot reach below", () => {
  control("a state hydrated without a history reports where its floor is, and only that is out of reach", () => {
    // A blob written before the engine kept a history (`test/fixtures/v3-chat-blob.json` is a real
    // one): one boundary cannot reconstruct history the blob never held, so everything below the
    // floor is unavailable until Restart — while the floor itself and everything above it roll back
    // as usual. The chat is not frozen, and it is not silently un-rollbackable either.
    const first = new StoryEngine({ now: () => 0 });
    first.loadStory(crossingStory());
    first.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 0 }, deltas: [{ q: "crossed", v: true, source: "extractor" }] });
    first.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    const saved = first.serialize();

    const migrated = new StoryEngine({ now: () => 0 });
    migrated.loadStory(crossingStory());
    migrated.hydrate(saved, null);
    expect(migrated.historyFrom()).toEqual({ boundary: saved.boundary, messageId: saved.lastMessageId });

    migrated.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(migrated.boundaryBeforeMessage(1)).toBeNull();
    expect(migrated.rollbackTo(0)).toEqual({ ok: false, reason: "history-unavailable", oldest: migrated.historyFrom() });
    expect(migrated.rollbackTo(saved.boundary)).toEqual({ ok: true, result: "applied" });
    expect(migrated.historyFrom().boundary).toBe(saved.boundary);
  });
});

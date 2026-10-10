import { parseStoryV2OrThrow } from "./validate";
import { StoryEngine } from "./engine";
import type { ApplyQueueEntry } from "./applyQueue";

const story = () => parseStoryV2OrThrow({
  format: 2, id: "f25", title: "F25", description: "The widgets glance shape.", roster: [],
  qualities: [
    { key: "found_ledger", type: "bool", source: "extractor", rubric: "Did the party find the ledger page?" },
    { key: "searched_dock", type: "bool", source: "extractor", rubric: "Did the party search the dock?" },
  ],
  checkpoints: [
    { id: "harbour", name: "Harbour", objective: "The harbour.", type: "anchor", start: true },
    { id: "dock", name: "Dock", objective: "The dock.", type: "anchor" },
  ],
  transitions: [{ from: "harbour", to: "dock", priority: 0, gate: { all: [{ q: "searched_dock", op: "==", v: true }, { q: "found_ledger", op: "==", v: true }] } }],
});

const read = (to: number, evidenceAt: number | undefined, v: boolean): ApplyQueueEntry => ({
  source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to },
  deltas: [{ q: "found_ledger", v, source: "extractor", ...(evidenceAt === undefined ? {} : { evidenceAt }) }],
});

const glance = () => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story());
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: "found_ledger", v: true, source: "extractor", writer: "manual" }] });
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  return engine;
};

const ledger = (engine: StoryEngine) => engine.serialize().blackboard.values.found_ledger;

describe("F25 (pod 2026-10-10 widgets glance): an author's /cp set is not undone by a read of messages it already saw", () => {
  it("a read whose evidence predates the author's write is discarded at the boundary (the pod: 'false' quoted from message 1, read after /cp set)", () => {
    const engine = glance();
    engine.enqueue(read(4, 1, false));
    const drained = engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(ledger(engine)).toBe(true);
    expect(drained.queue.discarded.flatMap((entry) => entry.deltas.map((delta) => delta.q))).toEqual(["found_ledger"]);
  });

  it("without an evidence line the read's window decides: a window that ends at or before the write is held", () => {
    const engine = glance();
    engine.enqueue(read(2, undefined, false));
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(ledger(engine)).toBe(true);
  });

  it("control: evidence from a message after the write is newer than the author and still applies", () => {
    const engine = glance();
    engine.enqueue(read(4, 3, false));
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(ledger(engine)).toBe(false);
  });

  it("control: with no author write the same stale read applies as before", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    engine.enqueue(read(4, 1, false));
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(ledger(engine)).toBe(false);
  });

  it("a rollback past the author's write takes the hold back with it", () => {
    const engine = glance();
    expect(engine.rollbackTo(1)).toEqual({ ok: true, result: "applied" });
    expect(engine.serialize().blackboard.authoredAt).toBeUndefined();
    engine.enqueue(read(4, 1, false));
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(ledger(engine)).toBe(false);
  });
});

import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "queued",
  title: "Queued",
  description: "A write read before a mutation",
  qualities: [{ key: "lit", type: "bool", source: "extractor", rubric: "Lit?" }, { key: "keyed", type: "bool", source: "extractor", rubric: "Keyed?" }],
  checkpoints: [{ id: "hall", name: "Hall", objective: "Wait", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const loaded = () => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story());
  engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
  return engine;
};

describe("v2.4 plan 01 T1 live: a mutation discards the queued writes that read it", () => {
  it("drops a write whose read window reaches the mutated message and applies nothing from it", () => {
    const engine = loaded();
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 8 }, deltas: [{ q: "lit", v: true }] });
    expect(engine.discardPendingFrom(8).map((write) => write.turnRange)).toEqual([{ from: 0, to: 8 }]);
    engine.commitBoundary({ lastMessageId: 7, chatLength: 8 });
    expect(engine.serialize().blackboard.values.lit).toBeUndefined();
  });

  it("control: a write read before the mutation, and an author write with no read window, both stay", () => {
    const engine = loaded();
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 5 }, deltas: [{ q: "lit", v: true }] });
    engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: "keyed", v: true }] });
    expect(engine.discardPendingFrom(6)).toEqual([]);
    expect(engine.pendingWrites).toHaveLength(2);
    expect(engine.discardPendingFrom(Number.NaN)).toEqual([]);
  });
});

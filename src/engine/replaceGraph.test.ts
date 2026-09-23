import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";

const story = (extra = false) => parseStoryV2OrThrow({
  format: 2,
  id: "graph-swap",
  title: "Graph swap",
  description: "A merged expansion changes the graph under a live run",
  qualities: [
    { key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" },
    { key: "rested", type: "bool", source: "extractor", rubric: "Rested?" },
  ],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
    ...(extra ? [{ id: "camp", name: "Camp", objective: "Sleep", type: "anchor" as const }] : []),
  ],
  transitions: [
    { id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } },
    ...(extra ? [{ id: "rest", from: "island", to: "camp", priority: 0, gate: { q: "rested", op: "==", v: true } }] : []),
  ],
  roster: [],
});

const crossedEngine = () => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story());
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 1 }, deltas: [{ q: "crossed", v: true, source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
  return engine;
};

describe("L4: replacing the graph under a live run", () => {
  it("keeps the write the boundary is about to commit", () => {
    const engine = crossedEngine();
    engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: "rested", v: true, source: "extractor" }] });
    engine.replaceGraph(story(true));
    const result = engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(result.queue.applied).toHaveLength(1);
    expect(engine.serialize().blackboard.values.rested).toBe(true);
    expect(result.fired?.to).toBe("camp");
  });

  it("keeps the history a later edit rolls back through", () => {
    const engine = crossedEngine();
    engine.replaceGraph(story(true));
    expect(engine.stateLog).toHaveLength(1);
    expect(engine.shouldRollbackFromMessage(1)).toBe(true);
    expect(engine.rollbackTo(0).ok).toBe(true);
    expect(engine.serialize().activeCheckpointId).toBe("bank");
  });

  it("control: reload + hydrate, the path it replaces, loses both", () => {
    const engine = crossedEngine();
    engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: "rested", v: true, source: "extractor" }] });
    const state = engine.serialize();
    engine.loadStory(story(true));
    engine.hydrate(state);
    expect(engine.stateLog).toHaveLength(0);
    expect(engine.commitBoundary({ lastMessageId: 2, chatLength: 3 }).queue.applied).toHaveLength(0);
  });
});

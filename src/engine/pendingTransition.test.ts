import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "whispers",
  title: "Whispers",
  description: "The queued read that moves the story on (T4-1-2 whispers -> the-duel)",
  qualities: [{ key: "duel_begun", type: "bool", source: "extractor", rubric: "Has the duel begun?" }, { key: "mood", type: "bool", source: "extractor", rubric: "Calm?" }],
  checkpoints: [
    { id: "whispers", name: "Whispers in the Halls", objective: "Listen", type: "anchor", start: true },
    { id: "the-duel", name: "Trial by Combat", objective: "Fight", type: "anchor" },
  ],
  transitions: [{ id: "t1", from: "whispers", to: "the-duel", priority: 0, gate: { q: "duel_begun", op: "==", v: true } }],
  roster: [],
});

const loaded = () => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story());
  engine.commitBoundary({ lastMessageId: 33, chatLength: 34 });
  return engine;
};

describe("T4-1-2: the transition the queued writes will fire at the next boundary", () => {
  it("names it without applying anything, and the next boundary fires exactly it", () => {
    const engine = loaded();
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 26, to: 33 }, deltas: [{ q: "duel_begun", v: true }] });
    expect(engine.pendingTransition()?.to).toBe("the-duel");
    expect(engine.serialize().blackboard.values.duel_begun).toBeUndefined();
    expect(engine.activeCheckpoint?.id).toBe("whispers");
    expect(engine.pendingWrites).toHaveLength(1);
    expect(engine.commitBoundary({ lastMessageId: 34, chatLength: 35 }).fired?.to).toBe("the-duel");
  });

  it("control: an empty queue, or writes that open no gate, name nothing", () => {
    const engine = loaded();
    expect(engine.pendingTransition()).toBeNull();
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 26, to: 33 }, deltas: [{ q: "mood", v: true }] });
    expect(engine.pendingTransition()).toBeNull();
  });
});

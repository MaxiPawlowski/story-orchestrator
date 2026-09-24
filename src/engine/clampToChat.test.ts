import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "clamp",
  title: "Clamp",
  description: "A delete with nothing to undo",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
  ],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  roster: [],
});

describe("L2: the engine's cursor follows a chat that got shorter", () => {
  it("clamps the cursor and the checkpoint start to the new end", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.commitBoundary({ lastMessageId: 7, chatLength: 8 });
    expect(engine.shouldRollbackFromMessage(1)).toBe(false);
    expect(engine.clampToChat(1)).toBe(true);
    expect(engine.serialize()).toMatchObject({ lastMessageId: 0, chatLength: 1 });
    expect(engine.serialize().checkpointStartedMessageId).toBeLessThanOrEqual(0);
  });

  it("control: a chat that still reaches the cursor is left alone", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.commitBoundary({ lastMessageId: 7, chatLength: 8 });
    expect(engine.clampToChat(8)).toBe(false);
    expect(engine.clampToChat(20)).toBe(false);
    expect(engine.serialize()).toMatchObject({ lastMessageId: 7, chatLength: 8 });
  });
});

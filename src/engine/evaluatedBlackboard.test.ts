import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "evaluated",
  title: "Evaluated",
  description: "the blackboard a gate was evaluated against",
  qualities: [
    { key: "found", type: "bool", source: "extractor", rubric: "Found?" },
    { key: "progress_toward_goal", type: "float", source: "code", monotonic: true, rubric: "Progress" },
  ],
  checkpoints: [
    { id: "start", name: "Start", objective: "Look", type: "anchor", start: true },
    { id: "mid", name: "Mid", objective: "Walk", type: "intermediate" },
    { id: "goal", name: "Goal", objective: "Arrive", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "mid", priority: 0, gate: { q: "found", op: "==", v: true }, effects: { progress: { anchor: "goal", amount: 1 } } },
    { from: "mid", to: "goal", priority: 0, gate: { q: "progress_toward_goal", op: ">=", v: 1 } },
  ],
  roster: [],
});

describe("v2.5 plan 07 A3: each boundary log entry records the blackboard its gates were evaluated against", () => {
  it("records the values after the drain and before the fired transition's progress effect", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 1 }, deltas: [{ q: "found", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    const [entry] = engine.stateLog;
    expect(entry.fired?.to).toBe("mid");
    expect(entry.evaluated).toEqual({ found: true });
    expect(entry.after.blackboard.values.progress_toward_goal).toBe(1);
  });

  it("is a copy: later writes do not reach a recorded entry", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 1 }, deltas: [{ q: "found", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(engine.stateLog[0].evaluated).toEqual({ found: true });
    expect(engine.stateLog[1].evaluated).toEqual({ found: true, progress_toward_goal: 1 });
    expect(engine.stateLog[1].fired?.to).toBe("goal");
  });

  it("a manual activation evaluated no gate, and says so", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.activateCheckpoint("goal", { lastMessageId: 1, chatLength: 2 });
    expect(engine.stateLog[0].source).toBe("manual");
    expect(engine.stateLog[0].evaluated).toBeNull();
  });

  it("survives serializeHistory and hydrateHistory", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 1 }, deltas: [{ q: "found", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    const saved = JSON.parse(JSON.stringify({ state: engine.serialize(), history: engine.serializeHistory() }));
    const reloaded = new StoryEngine({ now: () => 0 });
    reloaded.loadStory(story());
    reloaded.hydrate(saved.state, saved.history);
    expect(reloaded.stateLog[0].evaluated).toEqual({ found: true });
  });
});

import { BOUNDARY_STEPS, StoryEngine, type DerivedQualityView } from "./engine";
import { parseStoryV2OrThrow } from "./validate";
import { codexFactKey, questRewardKey } from "./schema";

const bool = (key: string, source: "code" | "extractor" = "extractor") => ({ key, type: "bool", source, rubric: `Whether ${key} is true.` });
const is = (key: string) => ({ q: key, op: "==", v: true });

const story = () => parseStoryV2OrThrow({
  format: 2, title: "Order lab", description: "One planted writer per step.",
  roster: [],
  qualities: [bool("searched"), bool("derived", "code"), bool("rewarded", "code"), { key: "message_count", type: "int", source: "code", rubric: "Messages." }],
  checkpoints: [
    { id: "start", name: "Start", type: "intermediate", start: true, objective: "o" },
    { id: "next", name: "Next", type: "intermediate", objective: "o" },
    { id: "end", name: "End", type: "anchor", objective: "o" },
  ],
  transitions: [
    { from: "start", to: "next", priority: 0, gate: { q: codexFactKey("people", "keeper", "reward"), op: ">=", v: 1 } },
    { from: "next", to: "end", priority: 0, gate: { q: codexFactKey("people", "keeper", "arrived"), op: ">=", v: 1 } },
  ],
  quests: [{ id: "find", title: "Find it", kind: "side", steps: [], done_when: is("searched"), reward: { set: { rewarded: true } } }],
  codex: {
    people: [{ id: "keeper", name: "The keeper", facts: [
      { id: "counted", text: "Counts the messages.", known_when: { q: "message_count", op: ">=", v: 3 } },
      { id: "derived", text: "Sees what the story works out.", known_when: is("derived") },
      { id: "reward", text: "Pays when the job is done.", known_when: is("rewarded") },
      { id: "arrived", text: "Waits at the next place.", known_when: { reached: "next" } },
    ] }],
  },
});

describe("SC2: one fixed per-boundary order", () => {
  test("the order is written once", () => {
    expect(BOUNDARY_STEPS).toEqual(["drain", "counters", "derive", "quests", "latch", "select", "entry", "latch-after-entry"]);
  });

  test("each step sees the one before it, inside a single boundary, and there is never a second transition", () => {
    const seen: DerivedQualityView[] = [];
    const engine = new StoryEngine({ now: () => 0, derive: (view) => { seen.push(view); return view.values.searched === true ? [{ q: "derived", v: true }] : []; } });
    const loaded = story();
    engine.loadStory(loaded);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "searched", v: true, source: "extractor" }] });
    const result = engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    const values = engine.serialize().blackboard.values;
    expect(values.message_count).toBe(3);
    expect(values[questRewardKey("find")]).toBe(true);
    expect(values[codexFactKey("people", "keeper", "counted")]).toBe(1);
    expect(values[codexFactKey("people", "keeper", "derived")]).toBe(1);
    expect(values[codexFactKey("people", "keeper", "reward")]).toBe(1);
    expect(result.fired?.to).toBe("next");
    expect(values[codexFactKey("people", "keeper", "arrived")]).toBe(1);
    expect(engine.serialize().activeCheckpointId).toBe("next");
    expect(seen).toHaveLength(1);
    expect(seen[0].activeCheckpointId).toBe("start");
  });

  test("the next boundary takes the transition the entry pass made possible", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "searched", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(engine.commitBoundary({ lastMessageId: 4, chatLength: 5 }).fired?.to).toBe("end");
  });

  test("a manual activation runs the latch pass after its entry", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story());
    engine.activateCheckpoint("next", { lastMessageId: 1, chatLength: 2 });
    expect(engine.serialize().blackboard.values[codexFactKey("people", "keeper", "arrived")]).toBe(1);
  });
});

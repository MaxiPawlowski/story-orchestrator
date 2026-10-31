import { parseStory, parseStoryOrThrow, PLAYER_TURNS_KEY, playerTurnsBetween, StoryEngine, type NormalizedStory } from "@engine/index";
import { diffStories } from "../storyDiff";

const raw = (patch: Record<string, unknown> = {}, urgent = false) => ({
  title: "Dwell", description: "Fixture.",
  qualities: [{ key: "door_open", type: "bool", source: "extractor", rubric: "Is the door open?" }, { key: "fire", type: "bool", source: "extractor", rubric: "Fire?" }],
  checkpoints: [
    { id: "hall", name: "Hall", objective: "x", type: "anchor", start: true, tension_target: "tense", ...patch },
    { id: "yard", name: "Yard", objective: "x", type: "anchor" },
    { id: "out", name: "Out", objective: "x", type: "anchor" },
  ],
  transitions: [
    { from: "hall", to: "yard", priority: 1, gate: { q: "door_open", op: "==", v: true } },
    { from: "hall", to: "out", priority: 2, gate: { q: "fire", op: "==", v: true }, ...(urgent ? { urgent: true } : {}) },
  ],
  roster: [],
});

const play = (story: NormalizedStory, key: string) => {
  const users: number[] = [];
  const engine = new StoryEngine({
    now: () => 0,
    derive: (view) => (story.qualityByKey[PLAYER_TURNS_KEY] ? [{ q: PLAYER_TURNS_KEY, v: playerTurnsBetween(users, view.checkpointStartedMessageId, view.lastMessageId) }] : []),
  });
  engine.loadStory(story);
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: key, v: true, source: "extractor" }] });
  const firedAt: number[] = [];
  for (let turn = 1; turn <= 5; turn += 1) {
    users.push(turn * 2 - 1);
    const result = engine.commitBoundary({ lastMessageId: turn * 2, chatLength: turn * 2 + 1, lastPlayerMessageId: turn * 2 - 1 });
    if (result.fired) firedAt.push(turn);
  }
  return firedAt;
};

describe("v3.0 42a F6: min_turns and urgent", () => {
  it("absent min_turns changes nothing: the exit fires on the first turn", () => {
    expect(play(parseStoryOrThrow(raw()), "door_open")).toEqual([1]);
  });

  it("min_turns holds every non-urgent exit until the nth player turn; urgent bypasses", () => {
    const story = parseStoryOrThrow(raw({ min_turns: 3 }, true));
    expect(story.qualityByKey[PLAYER_TURNS_KEY]).toMatchObject({ type: "int", source: "code" });
    expect(play(story, "door_open")).toEqual([3]);
    expect(play(story, "fire")).toEqual([1]);
  });

  it("compiles once (re-parsing the compiled story adds no second leaf) and storyDiff sees the change", () => {
    const story = parseStoryOrThrow(raw({ min_turns: 2 }));
    const again = parseStoryOrThrow({ ...raw({ min_turns: 2 }), qualities: story.qualities, transitions: story.transitions });
    expect(again.transitions).toEqual(story.transitions);
    const plain = parseStoryOrThrow(raw());
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(plain);
    expect(diffStories(plain, story, engine.serialize()).classification).not.toBe("identical");
  });

  it("refuses an out-of-range min_turns and min_turns on an open stretch", () => {
    expect(parseStory(raw({ min_turns: 0 }))).toEqual(expect.arrayContaining([expect.objectContaining({ path: "checkpoints.0.min_turns" })]));
    expect(parseStory(raw({ min_turns: 1.5 }))).toEqual(expect.arrayContaining([expect.objectContaining({ path: "checkpoints.0.min_turns" })]));
    const stretch = { ...raw(), checkpoints: [...raw().checkpoints, { id: "road", name: "Road", objective: "", type: "intermediate", min_turns: 2, stretch: { mode: "open", arrive_when: { q: "door_open", op: "==", v: true } } }],
      transitions: [...raw().transitions, { from: "road", to: "yard", priority: 1, gate: { q: "door_open", op: "==", v: true } }] };
    expect(parseStory(stretch)).toEqual(expect.arrayContaining([expect.objectContaining({ path: "checkpoints.3.min_turns" })]));
  });
});

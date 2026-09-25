import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import type { JudgeRuntime } from "./judge";
import { createTypedJudge } from "./typedRead";

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "typed-world",
  title: "Typed world",
  description: "v2.4 plan 04 T15",
  qualities: [{ key: "idol_taken", type: "bool", source: "extractor", rubric: "Does the player hold the idol?", read_as: "choice", evidence_from: "world" }],
  checkpoints: [
    { id: "hall", name: "Hall", objective: "Reach the idol", type: "anchor", start: true },
    { id: "altar", name: "Altar", objective: "Escape", type: "anchor" },
  ],
  transitions: [{ from: "hall", to: "altar", priority: 0, gate: { q: "idol_taken", op: "==", v: true } }],
  roster: [],
});

const window = {
  from: 4,
  to: 5,
  messages: [
    { index: 4, messageId: 4, speaker: "Max", text: "I grab the idol.", isUser: true },
    { index: 5, messageId: 5, speaker: "DM Narrator", text: "The idol is in your hands.", isUser: false },
  ],
};

const judgeAnswering = (choice: string) => ({
  active: () => true,
  ask: async () => ({ answers: { "q:idol_taken": { type: "choice", choice, confidence: 0.97, probabilities: {} } }, model: "jev" }),
}) as unknown as JudgeRuntime;

const run = (choice: string) => {
  const s = story();
  const engine = new StoryEngine();
  engine.loadStory(s);
  return createTypedJudge(() => judgeAnswering(choice))({ story: s, state: engine.serialize(), qualities: [s.qualityByKey.idol_taken], window });
};

describe("v2.4 plan 04 T15: the judged typed read carries the speaker kind and the source message", () => {
  it("leaves a world quality named on the player's line to the LLM read", async () => {
    expect(await run("yes in msg_4")).toMatchObject({ deltas: [], answered: [] });
  });

  it("answers it from a narrator line, and the delta names that line", async () => {
    const read = await run("yes in msg_5");
    expect(read?.answered).toEqual(["idol_taken"]);
    expect(read?.deltas).toEqual([expect.objectContaining({ delta: expect.objectContaining({ q: "idol_taken", v: true }), messageId: 5 })]);
  });
});

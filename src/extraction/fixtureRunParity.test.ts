import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { runningTotalRule } from "./contract";
import { buildFixtureRun } from "./fixtureRun";
import { sharedReadOverhead } from "./sharedRead";

jest.mock("@services/STAPI", () => ({ getContext: () => ({ chat: [], extensionSettings: {} }) }));

const raw = {
  format: 2,
  id: "parity",
  title: "Parity",
  description: "",
  qualities: [
    { key: "evidence", type: "int", source: "extractor", monotonic: true, rubric: "How many clues has the inspector found (0 to 3)?" },
    { key: "injuries", type: "int", source: "extractor", rubric: "How hurt is the inspector?" },
    { key: "chase_begun", type: "bool", source: "extractor", rubric: "Has the chase begun?" },
  ],
  checkpoints: [
    { id: "inquiry", name: "Inquiry", objective: "Find out who took the ledger.", type: "anchor", start: true },
    { id: "the-chase", name: "The Chase", objective: "Catch the thief.", type: "anchor" },
  ],
  transitions: [
    { from: "inquiry", to: "the-chase", priority: 1, gate: { any: [{ q: "evidence", op: ">=", v: 3 }, { q: "chase_begun", op: "==", v: true }] } },
    { from: "inquiry", to: "the-chase", priority: 0, gate: { q: "injuries", op: ">=", v: 3 } },
  ],
  roster: [],
};

const questions = (prompt: string) => prompt.slice(prompt.indexOf("Quality questions:"), prompt.indexOf("\nTranscript:"));

const shipped = (values: Record<string, number | boolean>) => {
  const engine = new StoryEngine();
  const story = parseStoryV2OrThrow(raw);
  engine.loadStory(story);
  const state = engine.serialize();
  return sharedReadOverhead({ story, state: { ...state, blackboard: { ...state.blackboard, values: { ...state.blackboard.values, ...values } } }, priority: 1, reason: "parity", model: (async () => ({ text: "" })) as never, ask: { role: "read", pass: "read" } } as never);
};

const fixture = (values: Record<string, number | boolean>) =>
  buildFixtureRun({ story: raw, transcript: [{ index: 0, speaker: "You", text: "I read the ledger.", is_user: true }], blackboard: { values, versions: {}, latched: {} } }).prompt;

describe("the live-suite fixture run measures the shipped read prompt (v2.8 31 F5)", () => {
  it("a running count carries its current value in the fixture prompt, as the shared read does", () => {
    expect(fixture({ evidence: 2 })).toContain(runningTotalRule(2));
  });

  it("asks the same quality questions as the shared read for the same blackboard", () => {
    const boards: Array<Record<string, number | boolean>> = [{}, { evidence: 2 }, { evidence: 1, injuries: 2, chase_begun: false }];
    for (const values of boards) {
      expect(questions(fixture(values))).toBe(questions(shipped(values)));
    }
  });

  it("control: an unread count carries no running total", () => {
    expect(fixture({})).not.toContain("Current value:");
  });
});

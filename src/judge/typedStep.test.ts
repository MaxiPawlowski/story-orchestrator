import type { Quality } from "@engine/index";
import { buildTypedPlan, readTypedDeltas, TYPED_STEP_LEVELS } from "./extraction";
import { judgeShapeIssues } from "./questions";
import type { JudgeAnswer } from "./types";

const trust: Quality = {
  key: "rel_mara_player_trust", type: "int", source: "extractor", read_as: "rating", rubric: "How much Mara feels trust toward the player: from -5 (the opposite) to 5 (completely)",
  criteria: { levels: Array.from({ length: 11 }, (_, index) => ({ value: index - 5, label: `${index - 5}` })) },
  step_rule: { step: 1, min: -5, max: 5, start: 2 },
};
const wide: Quality = { ...trust, key: "wide", step_rule: undefined };
const gate: Quality = { key: "gate_open", type: "bool", source: "extractor", read_as: "choice", rubric: "Is the gate open?" };
const window = [
  { id: 0, speaker: "You", text: "I cut her free.", isUser: true },
  { id: 1, speaker: "Mara", text: "Mara takes the rope and smiles. Thank you." },
];
const story = { title: "t", checkpointName: "c", objective: "o" };
const score = (value: number, confidence = 0.95): JudgeAnswer => ({ type: "score", score: value, confidence, probabilities: {} });
const pick = (choice: string): JudgeAnswer => ({ type: "choice", choice, confidence: 0.95, probabilities: {} });

describe("v2.8 31 F6: the typed judge reads a stepped relationship as a direction", () => {
  it("asks a three-level direction for an 11-level axis, so the request stays valid", () => {
    const plan = buildTypedPlan([trust, gate], window, story, { [trust.key]: 2 });
    expect(plan && judgeShapeIssues(plan.request)).toEqual([]);
    expect((plan?.request.questions[`q:${trust.key}`] as { criteria: string[] }).criteria).toEqual([...TYPED_STEP_LEVELS]);
  });

  it("moves one step from the current value, and answers unchanged with no write", () => {
    const plan = buildTypedPlan([trust], window, story, { [trust.key]: 2 });
    if (!plan) throw new Error("no plan");
    const read = (level: number) => readTypedDeltas({ [`q:${trust.key}`]: score(level), [`evidence:${trust.key}`]: pick("msg_1") }, plan, [trust], window);
    expect(Object.keys(plan.request.questions).some((id) => id.startsWith("presence:"))).toBe(false);
    expect(read(2).deltas.map((delta) => delta.v)).toEqual([3]);
    expect(read(0).deltas.map((delta) => delta.v)).toEqual([1]);
    expect(read(1).deltas).toEqual([]);
    expect(read(1).answered).toEqual([trust.key]);
  });

  it("an unsure direction is left to the LLM read: the floor reads the answer's own confidence", () => {
    const plan = buildTypedPlan([trust], window, story, { [trust.key]: 2 });
    if (!plan) throw new Error("no plan");
    expect(readTypedDeltas({ [`q:${trust.key}`]: score(2, 0.6), [`evidence:${trust.key}`]: pick("msg_1") }, plan, [trust], window)).toEqual({ deltas: [], answered: [] });
  });

  it("control: a rating with more levels than a score takes is left to the LLM read, and the rest are still asked", () => {
    const plan = buildTypedPlan([wide, gate], window, story);
    expect(plan && judgeShapeIssues(plan.request)).toEqual([]);
    expect(Object.keys(plan?.request.questions ?? {}).some((id) => id.includes("wide"))).toBe(false);
    expect(Object.keys(plan?.request.questions ?? {})).toContain("q:gate_open");
  });
});

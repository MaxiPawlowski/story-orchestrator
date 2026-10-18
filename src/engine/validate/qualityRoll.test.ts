import { parseStory } from "../validate";
import type { NormalizedStory, ValidationError } from "../schema";

const storyWith = (quality: Record<string, unknown>) => ({
  id: "roll-schema",
  title: "Roll schema",
  description: "SP7.b: the roll field on a quality.",
  qualities: [quality],
  checkpoints: [{ id: "a", name: "A", objective: "Start.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const rolled = (overrides: Record<string, unknown> = {}) => ({ key: "deep_swarm", type: "bool", source: "code", rubric: "Does a swarm cut off the way back?", roll: { sides: 6, target: 2 }, ...overrides });

const parsed = (quality: Record<string, unknown>) => parseStory(storyWith(quality));
const errorsOf = (quality: Record<string, unknown>) => {
  const result = parsed(quality);
  return Array.isArray(result) ? (result as ValidationError[]).map((error) => error.path) : [];
};

describe("SP7.b: a roll is part of the story schema, not read from the raw record", () => {
  it("a code bool or int quality keeps its roll in the normalized story", () => {
    const bool = parsed(rolled()) as NormalizedStory;
    expect(bool.qualityByKey.deep_swarm.roll).toEqual({ sides: 6, target: 2 });
    const int = parsed(rolled({ key: "clue_die", type: "int", roll: { sides: 6, target: 6 } })) as NormalizedStory;
    expect(int.qualityByKey.clue_die.roll).toEqual({ sides: 6, target: 6 });
  });

  it("a quality without a roll stays without one", () => {
    const story = parsed({ key: "met", type: "bool", source: "code", rubric: "Met?" }) as NormalizedStory;
    expect("roll" in story.qualityByKey.met).toBe(false);
  });

  it.each([
    ["an extractor quality", { source: "extractor" }],
    ["an enum quality", { type: "enum", values: ["a", "b"] }],
    ["a float quality", { type: "float" }],
    ["one side", { roll: { sides: 1, target: 1 } }],
    ["a target above the sides", { roll: { sides: 6, target: 7 } }],
    ["a zero target", { roll: { sides: 6, target: 0 } }],
    ["a fractional die", { roll: { sides: 6.5, target: 2 } }],
    ["a string die", { roll: "d6<=2" }],
  ])("refuses a roll on %s", (_label, overrides) => {
    expect(errorsOf(rolled(overrides))).toContain("qualities.0.roll");
  });
});

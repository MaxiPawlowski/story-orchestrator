import { isValidationErrorList, type StoryV2, type ValidationError } from "./schema";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";

const story = (effects: Record<string, unknown>): StoryV2 => ({
  format: 2,
  id: "scenario-fixture",
  title: "Scenario fixture",
  description: "A gate.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [{ id: "cp1", name: "The gate", objective: "Wait", type: "anchor", start: true, effects: effects as never }],
  transitions: [],
  roster: [],
});

const errors = (json: unknown): ValidationError[] => {
  const parsed = parseStoryV2(json);
  return isValidationErrorList(parsed) ? parsed : [];
};

const scenarioOf = (effects: Record<string, unknown>) => parseStoryV2OrThrow(story(effects)).checkpointById.cp1.effects?.scenario;

describe("v2.7 02 C1: checkpoint effects.scenario keeps three states", () => {
  it("keeps text, trimmed", () => {
    expect(scenarioOf({ scenario: "  The party waits at the city gate.  " })).toBe("The party waits at the city gate.");
  });

  it.each([[""], ["   "], [null]])("reads %p as clear (empty text)", (value) => {
    expect(scenarioOf({ scenario: value })).toBe("");
  });

  it("absent means inherit: the key stays out", () => {
    const effects = parseStoryV2OrThrow(story({ background: "gate.jpg" })).checkpointById.cp1.effects;
    expect(effects && Object.prototype.hasOwnProperty.call(effects, "scenario")).toBe(false);
  });

  it.each([[2], [true], [{ text: "x" }], [["x"]]])("refuses %p by path", (value) => {
    expect(errors(story({ scenario: value }))).toEqual([{ path: "checkpoints.0.effects.scenario", message: "scenario must be text, or empty or null to clear it" }]);
  });
});

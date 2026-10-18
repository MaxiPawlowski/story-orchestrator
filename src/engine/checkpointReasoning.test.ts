import { isValidationErrorList, type Story, type ValidationError } from "./schema";
import { parseStory, parseStoryOrThrow } from "./validate";

const story = (reasoning: unknown): Story => ({
  id: "reasoning-fixture",
  title: "Reasoning fixture",
  description: "A climax.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [{ id: "cp1", name: "The climax", objective: "Fight", type: "anchor", start: true, effects: { reasoning } as never }],
  transitions: [],
  roster: [],
});

const errors = (json: unknown): ValidationError[] => {
  const parsed = parseStory(json);
  return isValidationErrorList(parsed) ? parsed : [];
};

describe("R4: checkpoint effects.reasoning", () => {
  it.each(["off", "low", "medium", "high"])("keeps the story default %s independently of the checkpoint", (level) => {
    const parsed = parseStoryOrThrow({ ...story("high"), reasoning: level });
    expect(parsed.reasoning).toBe(level);
    expect(parsed.checkpointById.cp1.effects?.reasoning).toBe("high");
  });

  it("normalizes the story default and refuses invalid values at the story path", () => {
    expect(parseStoryOrThrow({ ...story("high"), reasoning: " LOW " }).reasoning).toBe("low");
    for (const reasoning of ["max", "", 2, true, null, { level: "high" }]) {
      expect(errors({ ...story("high"), reasoning })).toEqual([{ path: "reasoning", message: "reasoning must be off, low, medium or high" }]);
    }
    expect(parseStoryOrThrow(story("high")).reasoning).toBeUndefined();
  });
  it.each(["off", "low", "medium", "high"])("keeps %s", (level) => {
    expect(parseStoryOrThrow(story(level)).checkpointById.cp1.effects?.reasoning).toBe(level);
  });

  it("normalizes case and whitespace at parse", () => {
    expect(parseStoryOrThrow(story(" HIGH ")).checkpointById.cp1.effects?.reasoning).toBe("high");
  });

  it.each([["max"], ["default"], [""], [2], [true], [{ level: "high" }]])("refuses %p by path", (value) => {
    expect(errors(story(value))).toEqual([{ path: "checkpoints.0.effects.reasoning", message: "reasoning must be off, low, medium or high" }]);
  });

  it("control: a checkpoint without the key carries none", () => {
    const parsed = parseStoryOrThrow({ ...story("off"), checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true, effects: {} }] });
    expect(parsed.checkpointById.cp1.effects?.reasoning).toBeUndefined();
  });
});

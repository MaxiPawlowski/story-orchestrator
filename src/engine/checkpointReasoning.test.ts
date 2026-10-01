import { isValidationErrorList, type StoryV2, type ValidationError } from "./schema";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";

const story = (reasoning: unknown): StoryV2 => ({
  format: 2,
  id: "reasoning-fixture",
  title: "Reasoning fixture",
  description: "A climax.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [{ id: "cp1", name: "The climax", objective: "Fight", type: "anchor", start: true, effects: { reasoning } as never }],
  transitions: [],
  roster: [],
});

const errors = (json: unknown): ValidationError[] => {
  const parsed = parseStoryV2(json);
  return isValidationErrorList(parsed) ? parsed : [];
};

describe("R4: checkpoint effects.reasoning", () => {
  it.each(["off", "low", "medium", "high"])("keeps %s", (level) => {
    expect(parseStoryV2OrThrow(story(level)).checkpointById.cp1.effects?.reasoning).toBe(level);
  });

  it("normalizes case and whitespace at parse", () => {
    expect(parseStoryV2OrThrow(story(" HIGH ")).checkpointById.cp1.effects?.reasoning).toBe("high");
  });

  it.each([["max"], ["default"], [""], [2], [true], [{ level: "high" }]])("refuses %p by path", (value) => {
    expect(errors(story(value))).toEqual([{ path: "checkpoints.0.effects.reasoning", message: "reasoning must be off, low, medium or high" }]);
  });

  it("control: a checkpoint without the key carries none", () => {
    const parsed = parseStoryV2OrThrow({ ...story("off"), checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true, effects: {} }] });
    expect(parsed.checkpointById.cp1.effects?.reasoning).toBeUndefined();
  });
});

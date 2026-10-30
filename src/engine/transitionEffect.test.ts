import { isValidationErrorList, type CheckpointEffects, type Story, type ValidationError } from "./schema";
import { parseStory, parseStoryOrThrow } from "./validate";
import { diffStories } from "./storyDiff";

const story = (effects: unknown): Story => ({
  id: "transition-fixture",
  title: "Transition fixture",
  description: "Stage transitions.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true, effects: effects as CheckpointEffects }],
  transitions: [],
  roster: [],
});

const errors = (json: unknown): ValidationError[] => {
  const parsed = parseStory(json);
  return isValidationErrorList(parsed) ? parsed : [];
};

describe("effects.transition", () => {
  it("takes a bare kind or { kind, ms, color } and normalizes case and color", () => {
    expect(parseStoryOrThrow(story({ transition: "Fade" })).checkpointById.cp1.effects?.transition).toEqual({ kind: "fade" });
    expect(parseStoryOrThrow(story({ transition: { kind: "iris", ms: 1400, color: " #1A1A2E " } })).checkpointById.cp1.effects?.transition)
      .toEqual({ kind: "iris", ms: 1400, color: "#1a1a2e" });
    for (const kind of ["dissolve", "wipe", "cut"]) expect(parseStoryOrThrow(story({ transition: { kind } })).checkpointById.cp1.effects?.transition).toEqual({ kind });
  });

  it("refuses an unknown kind, a bad duration, a non-hex color and an unknown key, naming the field", () => {
    expect(errors(story({ transition: "spin" }))).toEqual([{ path: "checkpoints.0.effects.transition", message: "transition must be dissolve, fade, wipe, iris or cut, or { kind, ms, color }" }]);
    expect(errors(story({ transition: { kind: "spin" } })).map((error) => error.path)).toEqual(["checkpoints.0.effects.transition.kind"]);
    expect(errors(story({ transition: { kind: "fade", ms: 9000 } })).map((error) => error.path)).toEqual(["checkpoints.0.effects.transition.ms"]);
    expect(errors(story({ transition: { kind: "fade", ms: 12.5 } })).map((error) => error.path)).toEqual(["checkpoints.0.effects.transition.ms"]);
    expect(errors(story({ transition: { kind: "fade", color: "red" } })).map((error) => error.path)).toEqual(["checkpoints.0.effects.transition.color"]);
    expect(errors(story({ transition: { kind: "fade", duration: 400 } })).map((error) => error.path)).toEqual(["checkpoints.0.effects.transition.duration"]);
  });

  it("is presentation only: changing it is a compatible story edit", () => {
    const before = parseStoryOrThrow(story({ transition: "fade" }));
    const after = parseStoryOrThrow(story({ transition: { kind: "wipe", ms: 700 } }));
    expect(diffStories(before, after, null).classification).toBe("compatible");
  });
});

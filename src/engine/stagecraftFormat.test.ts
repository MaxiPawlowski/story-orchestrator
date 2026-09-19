import { isValidationErrorList, type StoryV2, type ValidationError } from "./schema";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";

const story = (patch: Partial<StoryV2> & { checkpoints?: StoryV2["checkpoints"] } = {}): StoryV2 => ({
  format: 2,
  id: "stagecraft-fixture",
  title: "Stagecraft fixture",
  description: "Presentation fields.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  ...patch,
});

const errors = (json: unknown): ValidationError[] => {
  const parsed = parseStoryV2(json);
  return isValidationErrorList(parsed) ? parsed : [];
};

describe("format-2 stagecraft fields", () => {
  it("normalizes a bare background filename into { name }", () => {
    const parsed = parseStoryV2OrThrow(story({
      checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true, effects: { background: "tavern day.jpg" } as never }],
    }));
    expect(parsed.checkpointById.cp1.effects?.background).toEqual({ name: "tavern day.jpg" });
  });

  it("keeps the object form and trims it", () => {
    const parsed = parseStoryV2OrThrow(story({
      checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true, effects: { background: { name: " royal.jpg " } } }],
    }));
    expect(parsed.checkpointById.cp1.effects?.background).toEqual({ name: "royal.jpg" });
  });

  it("rejects a background that names nothing", () => {
    expect(errors(story({
      checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true, effects: { background: { name: "" } } }],
    }))).toEqual([{ path: "checkpoints.0.effects.background", message: "background must be a filename string or { name }" }]);
  });

  it("reads the curator allowlist and accepts the singular alias", () => {
    expect(parseStoryV2OrThrow(story({ stagecraft: { lorebooks: ["Xentar Checkpoints", " Story Lore "] } })).stagecraft)
      .toEqual({ lorebooks: ["Xentar Checkpoints", "Story Lore"] });
    expect(parseStoryV2OrThrow(story({ stagecraft: { lorebook: "Story Lore" } as never })).stagecraft).toEqual({ lorebooks: ["Story Lore"] });
  });

  it("treats an empty allowlist as no allowlist at all", () => {
    expect(parseStoryV2OrThrow(story({ stagecraft: { lorebooks: [] } })).stagecraft).toBeUndefined();
    expect(parseStoryV2OrThrow(story()).stagecraft).toBeUndefined();
  });

  it("rejects a stagecraft block that is not an object", () => {
    expect(errors(story({ stagecraft: "Story Lore" as never }))).toEqual([{ path: "stagecraft", message: "stagecraft must be an object" }]);
  });
});

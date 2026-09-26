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

  it("reads the curator allowlist, and refuses the removed singular alias with a hint", () => {
    expect(parseStoryV2OrThrow(story({ stagecraft: { lorebooks: ["Xentar Checkpoints", " Story Lore "] } })).stagecraft)
      .toEqual({ lorebooks: ["Xentar Checkpoints", "Story Lore"] });
    expect(errors(story({ stagecraft: { lorebook: "Story Lore" } as never }))).toEqual([{ path: "stagecraft.lorebook", message: 'unknown key (did you mean "lorebooks"?)' }]);
  });

  it("refuses the removed requirement aliases and lore_select's singular with a did-you-mean hint", () => {
    expect(errors(story({ requirements: { groupMembers: ["Arin"] } as never }))).toEqual([{ path: "requirements.groupMembers", message: 'unknown key (did you mean "members"?)' }]);
    expect(errors(story({ requirements: { persona: "Max" } as never }))).toEqual([{ path: "requirements.persona", message: 'unknown key (did you mean "personas"?)' }]);
    expect(errors(story({ requirements: { global_lorebooks: ["Lore"] } as never }))).toEqual([{ path: "requirements.global_lorebooks", message: 'unknown key (did you mean "lorebooks"?)' }]);
    expect(errors(story({ lore_select: { lorebook: "Lore" } as never }))).toEqual([{ path: "lore_select.lorebook", message: 'unknown key (did you mean "lorebooks"?)' }]);
    expect(errors(story({ requirements: { zzz: [] } as never }))[0].message).toBe("unknown key (known: personas, members, lorebooks)");
  });

  it("control: the canonical keys parse with no error", () => {
    expect(errors(story({ requirements: { personas: ["Max"], members: ["Arin"], lorebooks: ["Lore"] }, stagecraft: { lorebooks: ["Lore"] }, lore_select: { lorebooks: ["Lore"], top_k: 3, min_p: 0.2 } }))).toEqual([]);
  });

  it("treats an empty allowlist as no allowlist at all", () => {
    expect(parseStoryV2OrThrow(story({ stagecraft: { lorebooks: [] } })).stagecraft).toBeUndefined();
    expect(parseStoryV2OrThrow(story()).stagecraft).toBeUndefined();
  });

  it("rejects a stagecraft block that is not an object", () => {
    expect(errors(story({ stagecraft: "Story Lore" as never }))).toEqual([{ path: "stagecraft", message: "stagecraft must be an object" }]);
  });
});

describe("format-2 scene_read (v2.2 plan 03)", () => {
  it("keeps trimmed places and times, and only an explicit inject: false", () => {
    const parsed = parseStoryV2OrThrow(story({ scene_read: { locations: [" guild hall ", "", "desert road"], times: ["day", "night"], inject: true } }));
    expect(parsed.scene_read).toEqual({ locations: ["guild hall", "desert road"], times: ["day", "night"] });
    expect(parseStoryV2OrThrow(story({ scene_read: { inject: false } })).scene_read).toEqual({ inject: false });
    expect(parseStoryV2OrThrow(story({ scene_read: {} })).scene_read).toBeUndefined();
  });

  it("rejects a non-object block and a non-boolean inject", () => {
    expect(errors(story({ scene_read: "guild hall" as never }))).toEqual([{ path: "scene_read", message: "scene_read must be an object" }]);
    expect(errors(story({ scene_read: { inject: "yes" as never } }))).toEqual([{ path: "scene_read.inject", message: "scene_read.inject must be true or false" }]);
  });
});

describe("format-2 lore_select (v2.2 plan 04)", () => {
  it("keeps the books, rounds top_k, and drops an empty block", () => {
    expect(parseStoryV2OrThrow(story({ lore_select: { lorebooks: [" Story Lore "], top_k: 5.6, min_p: 0.7 } })).lore_select).toEqual({ lorebooks: ["Story Lore"], top_k: 6, min_p: 0.7 });
    expect(parseStoryV2OrThrow(story({ lore_select: { lorebooks: [] } })).lore_select).toBeUndefined();
  });

  it("rejects out-of-range numbers and a non-object block", () => {
    expect(errors(story({ lore_select: { lorebooks: ["L"], top_k: 40 } }))).toEqual([{ path: "lore_select.top_k", message: "lore_select.top_k must be a number from 1 to 12" }]);
    expect(errors(story({ lore_select: { lorebooks: ["L"], min_p: 2 } }))).toEqual([{ path: "lore_select.min_p", message: "lore_select.min_p must be a number from 0 to 1" }]);
    expect(errors(story({ lore_select: "Story Lore" as never }))).toEqual([{ path: "lore_select", message: "lore_select must be an object" }]);
  });
});


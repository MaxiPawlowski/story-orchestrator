import { createQualityMacroSync, QUALITY_MACRO_PREFIX, qualityMacroPlan, renderQualityArg, renderQualityValue } from "./qualityMacros";

const story = (keys: string[]) => ({ qualities: keys.map((key) => ({ key })) });

const harness = () => {
  const registered = new Map<string, () => string>();
  const journal: Array<[string, string]> = [];
  const values: Record<string, unknown> = {};
  const sync = createQualityMacroSync({
    register: (name, read) => { registered.set(name, read); },
    unregister: (name) => { registered.delete(name); },
    journal: (summary, detail) => { journal.push([summary, detail]); },
    values: () => values,
  });
  return { sync, registered, journal, values };
};

describe("per-quality macros {{story_quality_<key>}} (v2.4 plan 08 R15)", () => {
  it("plans one macro per authored key, and skips a key the macro engine cannot name", () => {
    expect(qualityMacroPlan(story(["has_key", "trap_state", "Bad-Key", "two words"]))).toEqual({ keys: ["has_key", "trap_state"], skipped: ["Bad-Key", "two words"] });
    expect(qualityMacroPlan(story(["progress_toward_saga-board-4"]))).toEqual({ keys: ["progress_toward_saga-board-4"], skipped: [] });
    expect(QUALITY_MACRO_PREFIX).toBe("story_quality_");
  });

  it("renders the blackboard value, and (unset) when the quality holds none", () => {
    expect(renderQualityValue({ has_key: true, gold: 0, place: "gate" }, "has_key")).toBe("true");
    expect(renderQualityValue({ gold: 0 }, "gold")).toBe("0");
    expect(renderQualityValue({ place: "gate" }, "place")).toBe("gate");
    expect(renderQualityValue({}, "missing")).toBe("(unset)");
    expect(renderQualityValue({ held: null }, "held")).toBe("(unset)");
  });

  it("registers a macro per key that reads the live blackboard at evaluation, never a copy", () => {
    const { sync, registered, values } = harness();
    sync(story(["has_key"]));
    expect([...registered.keys()]).toEqual(["story_quality_has_key"]);
    expect(registered.get("story_quality_has_key")?.()).toBe("(unset)");
    values.has_key = true;
    expect(registered.get("story_quality_has_key")?.()).toBe("true");
  });

  it("unregisters the departed story's keys on a story swap, and does nothing when the keys did not change", () => {
    const { sync, registered } = harness();
    sync(story(["has_key", "gold"]));
    const first = registered.get("story_quality_gold");
    sync(story(["gold", "has_key"]));
    expect(registered.get("story_quality_gold")).toBe(first);
    sync(story(["torch_lit"]));
    expect([...registered.keys()]).toEqual(["story_quality_torch_lit"]);
    sync(null);
    expect([...registered.keys()]).toEqual([]);
  });

  it("journals a skipped key once per story, not once per snapshot", () => {
    const { sync, journal } = harness();
    sync(story(["ok_key", "Not-Ok"]));
    sync(story(["ok_key", "Not-Ok"]));
    expect(journal).toEqual([["quality macro skipped", "{{story_quality_Not-Ok}} is not registered: a macro key must be lowercase letters, digits, _ and -"]]);
  });
});

describe("{{story_quality::<key>}} (v2.5 plan 07 A2)", () => {
  const declared = { qualities: [{ key: "gold" }, { key: "place" }, { key: "has_key" }] };

  it("reads the blackboard value of a declared quality, and (unset) when it holds none", () => {
    expect(renderQualityArg(declared, { gold: 3, place: "gate" }, "gold")).toBe("3");
    expect(renderQualityArg(declared, { gold: 3, place: "gate" }, "place")).toBe("gate");
    expect(renderQualityArg(declared, { gold: 3 }, "has_key")).toBe("(unset)");
  });

  it("names a key the story does not declare instead of reading (unset)", () => {
    expect(renderQualityArg(declared, { stray: 1 }, "stray")).toBe("(no quality \"stray\")");
    expect(renderQualityArg(null, {}, "gold")).toBe("(no quality \"gold\")");
  });

  it("trims the argument the way an author types it", () => {
    expect(renderQualityArg(declared, { gold: 3 }, " gold ")).toBe("3");
  });

  it("never mutates the blackboard it reads", () => {
    const values = Object.freeze({ gold: 3 }) as Record<string, unknown>;
    expect(() => renderQualityArg(declared, values, "gold")).not.toThrow();
    expect(values).toEqual({ gold: 3 });
  });
});

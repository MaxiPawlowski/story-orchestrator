import { parseStoryV2 } from "./validate";
import { HOUSE_RULES_MAX, HOUSE_RULE_MAX_CHARS, type NormalizedStoryV2, type ValidationError } from "./schema";

const story = (house_rules?: unknown) => ({
  format: 2,
  title: "Rules",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "cp1", name: "Start", objective: "Go", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  ...(house_rules === undefined ? {} : { house_rules }),
});

const errors = (value: unknown): string[] => {
  const parsed = parseStoryV2(story(value));
  return Array.isArray(parsed) ? (parsed as ValidationError[]).map((error) => `${error.path}: ${error.message}`) : [];
};

describe("house_rules (v2.4 plan 07 T23, rule 6: additive and optional)", () => {
  it("absent means no rules, as today", () => {
    expect((parseStoryV2(story()) as NormalizedStoryV2).house_rules).toBeUndefined();
    expect((parseStoryV2(story([])) as NormalizedStoryV2).house_rules).toBeUndefined();
  });

  it("keeps trimmed rules in order", () => {
    expect((parseStoryV2(story(["  No guns. ", "Magic cannot heal wounds."])) as NormalizedStoryV2).house_rules).toEqual(["No guns.", "Magic cannot heal wounds."]);
  });

  it("refuses a non-list, an empty rule, a duplicate, an over-long rule and more than eight", () => {
    expect(errors("No guns.")).toEqual(["house_rules: house_rules must be a list of rules"]);
    expect(errors(["No guns.", "  "])).toEqual(["house_rules.1: a house rule must be non-empty text"]);
    expect(errors(["No guns.", 3])).toEqual(["house_rules.1: a house rule must be non-empty text"]);
    expect(errors(["No guns.", "no GUNS."])).toEqual(["house_rules.1: duplicate house rule 'no GUNS.'"]);
    expect(errors(["x".repeat(HOUSE_RULE_MAX_CHARS + 1)])).toEqual([`house_rules.0: a house rule is at most ${HOUSE_RULE_MAX_CHARS} characters`]);
    expect(errors(["x".repeat(HOUSE_RULE_MAX_CHARS)])).toEqual([]);
    expect(errors(Array.from({ length: HOUSE_RULES_MAX + 1 }, (_, index) => `Rule ${index}.`))).toEqual([`house_rules: house_rules holds at most ${HOUSE_RULES_MAX} rules`]);
    expect(errors(Array.from({ length: HOUSE_RULES_MAX }, (_, index) => `Rule ${index}.`))).toEqual([]);
  });
});

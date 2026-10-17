import { parseStoryV2, parseStoryV2OrThrow } from "../validate";
import { usesGameLayer } from "./gameLayer";
import { RUMOR_RESTATES_SECRET } from "./rumors";
import type { ValidationError } from "../schema";

type Raw = Record<string, unknown> & { roster: Array<Record<string, unknown>>; rumors?: unknown[] };

const base = (): Raw => ({
  format: 2, id: "rumor-mill", title: "Rumor mill", description: "plan 44",
  qualities: [{ key: "mill_burned", type: "bool", source: "extractor", rubric: "Did the mill burn?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [
    { id: "bryn", name: "Bryn", gossip: { talks_to: ["tam"], contact: "any", delay: { boundaries: [1, 2] } } },
    { id: "tam", name: "Tam", gossip: { talks_to: ["ula"] } },
    { id: "ula", name: "Ula" },
  ],
  rumors: [{
    id: "mill-fire", from: "bryn", claim: "the old mill burned down",
    versions: [{ text: "the old mill burned down", truth: "true", weight: 3 }, { text: "someone set the old mill on fire", truth: "false", weight: 1 }],
    starts_when: { q: "mill_burned", op: "==", v: true },
  }],
});

const errorsOf = (json: unknown): ValidationError[] => {
  const parsed = parseStoryV2(json);
  return Array.isArray(parsed) ? parsed : [];
};

const patched = (edit: (story: Raw) => void): Raw => {
  const story = base();
  edit(story);
  return story;
};

describe("plan 44 stage 1: rumors and gossip channels validate as authored data", () => {
  it("compiles channels and rumors into the story's rumor net, with defaults", () => {
    const story = parseStoryV2OrThrow(base());
    expect(story.rumorNet?.channels).toEqual([
      { from: "bryn", talks_to: ["tam"], contact: "any", delay: { boundaries: [1, 2] }, hops: 2 },
      { from: "tam", talks_to: ["ula"], contact: "together", delay: { boundaries: [1, 3] }, hops: 2 },
    ]);
    expect(story.rumorNet?.rumors[0]).toMatchObject({ id: "mill-fire", from: "bryn", versions: [{ weight: 3 }, { weight: 1 }] });
    expect(usesGameLayer(base())).toBe(true);
    expect(usesGameLayer({ roster: [{ id: "a", gossip: { talks_to: ["b"] } }] })).toBe(true);
  });

  it.each([
    ["an unknown member", (story: Raw) => { story.roster[0].gossip = { talks_to: ["ghost"] }; }, "'ghost' is not in the cast"],
    ["a member talking to itself", (story: Raw) => { story.roster[0].gossip = { talks_to: ["bryn"] }; }, "does not pass news to itself"],
    ["hops past the limit", (story: Raw) => { story.roster[0].gossip = { talks_to: ["tam"], hops: 4 }; }, "hops is a whole number from 1 to 3"],
    ["days without a clock", (story: Raw) => { story.roster[0].gossip = { talks_to: ["tam"], delay: { days: [1, 2] } }; }, "needs a story clock"],
    ["a reversed delay", (story: Raw) => { story.roster[0].gossip = { talks_to: ["tam"], delay: { boundaries: [3, 1] } }; }, "min first"],
    ["an unknown channel key", (story: Raw) => { story.roster[0].gossip = { talks_to: ["tam"], via: "letters" }; }, "unknown key"],
    ["an unknown rumor origin", (story: Raw) => { (story.rumors as Array<Record<string, unknown>>)[0].from = "ghost"; }, "'ghost' is not in the cast"],
    ["a duplicate rumor", (story: Raw) => { story.rumors = [...(story.rumors ?? []), (story.rumors ?? [])[0]]; }, "a second rumor"],
    ["a leak to an unknown member", (story: Raw) => { (story.rumors as Array<Record<string, unknown>>)[0].leaks_to = [{ member: "ghost", when: { q: "mill_burned", op: "==", v: true } }]; }, "'ghost' is not in the cast"],
    ["a leak without a gate", (story: Raw) => { (story.rumors as Array<Record<string, unknown>>)[0].leaks_to = [{ member: "ula" }]; }, "a leak needs when"],
    ["a gate on an unknown quality", (story: Raw) => { (story.rumors as Array<Record<string, unknown>>)[0].starts_when = { q: "nope", op: "==", v: true }; }, "nope"],
    ["an invalid truth", (story: Raw) => { (story.rumors as Array<Record<string, unknown>>)[0].versions = [{ text: "x", truth: "maybe" }]; }, "truth is true, false or unknown"],
  ])("refuses %s", (_label, edit, message) => {
    expect(errorsOf(patched(edit)).map((error) => error.message).join(" | ")).toContain(message);
  });

  it("refuses a rumor whose words restate a secret relationship label", () => {
    const story = patched((raw) => {
      raw.roster[2] = { id: "ula", name: "Ula", relationships: [{ toward: "tam", axes: ["trust"], secret: [{ id: "loves", label: "secretly loves the miller", revealed_when: { q: "mill_burned", op: "==", v: true } }] }] };
      (raw.rumors as Array<Record<string, unknown>>)[0].claim = "Ula secretly loves the miller";
      delete (raw.rumors as Array<Record<string, unknown>>)[0].versions;
    });
    expect(errorsOf(story).map((error) => error.message)).toContain(RUMOR_RESTATES_SECRET);
  });

  it("accepts days with a clock and a gate contact", () => {
    const story = patched((raw) => {
      raw.clock = { times: ["morning", "evening"] };
      raw.roster[1].gossip = { talks_to: ["ula"], contact: { q: "mill_burned", op: "==", v: true }, delay: { days: [1, 2] } };
    });
    expect(errorsOf(story)).toEqual([]);
  });
});

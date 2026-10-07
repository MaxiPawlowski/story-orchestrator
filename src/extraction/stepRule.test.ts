import type { Quality } from "@engine/index";
import { applyRatingGrounding } from "./ratingGuard";
import type { ParsedDelta } from "./types";

const trust: Quality = {
  key: "rel_arin_player_trust", type: "int", source: "extractor", read_as: "rating", rubric: "from -3 (the opposite) to 3 (completely)",
  criteria: { levels: [-3, -2, -1, 0, 1, 2, 3].map((value) => ({ value, label: `${value}` })) },
  step_rule: { step: 1, min: -3, max: 3, start: 0 },
};

const time: Quality = {
  key: "time_of_day", type: "enum", values: ["morning", "afternoon", "evening", "night"], source: "extractor", read_as: "choice", rubric: "time",
  step_rule: { step: 1, cycle: true },
};

const qualities = { [trust.key]: trust, [time.key]: time };

const delta = (q: string, v: string | number): ParsedDelta => ({ delta: { q, v, source: "extractor" }, evidence: "she smiles" });

const read = (deltas: ParsedDelta[], values: Record<string, string | number> = {}) =>
  applyRatingGrounding(qualities, values, deltas).accepted.map((entry) => entry.delta.v);

describe("v2.7 plan 37 L1: a relationship moves at most its step a turn", () => {
  it("clamps a jump to one step from the current value, and from start when unread", () => {
    expect(read([delta(trust.key, 3)], { [trust.key]: 0 })).toEqual([1]);
    expect(read([delta(trust.key, -3)], { [trust.key]: 0 })).toEqual([-1]);
    expect(read([delta(trust.key, 3)])).toEqual([1]);
    expect(read([delta(trust.key, 1)], { [trust.key]: 0 })).toEqual([1]);
  });

  it("never leaves the range and never holds a reading for its evidence", () => {
    expect(read([delta(trust.key, 9)], { [trust.key]: 3 })).toEqual([3]);
    expect(applyRatingGrounding(qualities, { [trust.key]: 0 }, [delta(trust.key, 2)]).held).toEqual([]);
  });

  it("moves the time of day one step forward a turn, wrapping round the night", () => {
    expect(read([delta(time.key, "night")], { [time.key]: "morning" })).toEqual(["afternoon"]);
    expect(read([delta(time.key, "morning")], { [time.key]: "night" })).toEqual(["morning"]);
    expect(read([delta(time.key, "morning")], { [time.key]: "afternoon" })).toEqual(["evening"]);
    expect(read([delta(time.key, "evening")])).toEqual(["evening"]);
    expect(read([delta(time.key, "evening")], { [time.key]: "evening" })).toEqual(["evening"]);
  });

  it("leaves a quality without a step rule untouched (control)", () => {
    const loose: Quality = { ...trust, key: "loose", step_rule: undefined, criteria: undefined, rubric: "x" };
    expect(applyRatingGrounding({ loose }, { loose: 0 }, [delta("loose", 3)]).accepted.map((entry) => entry.delta.v)).toEqual([3]);
  });
});

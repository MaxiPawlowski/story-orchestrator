import { parseStoryV2OrThrow, CLOCK_READ_KEY } from "@engine/index";
import { deriveScope } from "./scope";

const story = (gate: Record<string, unknown>) => parseStoryV2OrThrow({
  format: 2, title: "Clock scope", description: "d", roster: [],
  clock: { times: ["morning", "evening", "night"] },
  qualities: [{ key: "left", type: "bool", source: "extractor", rubric: "Left?" }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "o" }, { id: "end", name: "End", type: "anchor", objective: "o" }],
  transitions: [{ from: "start", to: "end", priority: 0, gate }],
});

const keys = (gate: Record<string, unknown>) => deriveScope(story(gate), "start", { values: {}, versions: {}, latched: {} }).map((entry) => entry.key);

describe("plan 50 B1a: the read asks for the time of day while a gate waits on story time", () => {
  test.each([["story_day", 3], ["time_of_day", "night"], ["story_time", 4], ["is_night", true]])("a gate on %s puts life_time_read in the read", (key, value) => {
    expect(keys({ all: [{ q: "left", op: "==", v: true }, { q: key, op: key === "story_day" || key === "story_time" ? ">=" : "==", v: value }] })).toContain(CLOCK_READ_KEY);
  });

  test("control: a gate on no time key leaves it out, and no derived time key is ever read", () => {
    expect(keys({ q: "left", op: "==", v: true })).not.toContain(CLOCK_READ_KEY);
    expect(keys({ q: "story_day", op: ">=", v: 3 }).filter((key) => ["story_day", "time_of_day", "story_time", "time_part", "is_night"].includes(key))).toEqual([]);
  });
});

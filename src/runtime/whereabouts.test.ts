import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow } from "@engine/index";
import { buildCandidates } from "@talk/rules";
import { presentRosterIds } from "./whereabouts";

const STORY = parseStoryV2OrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));

describe("v2.7 plan 37 L4: a schedule drops a member from the speakers, and writes nothing", () => {
  it("drops the away member and keeps everyone else", () => {
    expect(presentRosterIds(STORY, { time_of_day: "night", location: "market" }, ["arin", "narrator"])).toEqual(["narrator"]);
  });

  it("brings her back when the party reaches her, or when the schedule no longer holds", () => {
    expect(presentRosterIds(STORY, { time_of_day: "night", location: "docks" }, ["arin", "narrator"])).toEqual(["arin", "narrator"]);
    expect(presentRosterIds(STORY, { time_of_day: "morning", location: "market" }, ["arin", "narrator"])).toEqual(["arin", "narrator"]);
  });

  it("feeds the talk rules, so an away member is never a candidate", () => {
    const present = presentRosterIds(STORY, { time_of_day: "night", location: "market" }, ["arin", "narrator"]);
    expect(buildCandidates({ speakers: [{ member: "arin" }, { member: "narrator" }] }, STORY.roster, present).map((candidate) => candidate.rosterId)).toEqual(["narrator"]);
  });

  it("leaves a story without schedules untouched (control)", () => {
    expect(presentRosterIds(null, { time_of_day: "night" }, ["arin"])).toEqual(["arin"]);
  });
});

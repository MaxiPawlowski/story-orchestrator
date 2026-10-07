import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { addressedAmong } from "@talk/rules";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { awayNoticeLine, createAwayNotice } from "./awayNotice";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")) as { roster: Array<Record<string, unknown>> };

const storyWith = (aliases: Record<string, string[]> = {}): NormalizedStoryV2 => {
  const raw = JSON.parse(JSON.stringify(RAW)) as typeof RAW;
  raw.roster = raw.roster.map((member) => (aliases[String(member.id)] ? { ...member, aliases: aliases[String(member.id)] } : member));
  return parseStoryV2OrThrow(raw);
};

const STORY = storyWith({ arin: ["the guide"] });
const AWAY = { time_of_day: "night", location: "market" };
const HERE = { time_of_day: "night", location: "docks" };
const said = (...lines: string[]) => lines.flatMap((mes) => [{ is_user: true, mes, name: "Max" }, { is_user: false, mes: "…", name: "DM Narrator" }]);

describe("owner decision 2026-10-07 (plan 37 Q3): the narrator is told an addressed away member is not here", () => {
  it("names the away member the player's latest line speaks to, by name or by an alias only she has", () => {
    for (const line of ["Arin, are you there?", "I wave to the guide."]) {
      const notice = awayNoticeLine(STORY, AWAY, said(line));
      expect(notice).toContain("Arin is not here");
      expect(notice).toContain("the narrator says Arin is not present");
    }
  });

  it("says nothing when the member is here, when nobody away is addressed, or with no schedule at all (control)", () => {
    expect(awayNoticeLine(STORY, HERE, said("Arin, are you there?"))).toBeNull();
    expect(awayNoticeLine(STORY, AWAY, said("I look around the market."))).toBeNull();
    expect(awayNoticeLine(STORY, AWAY, said("Don't tell Arin about this."))).toBeNull();
    expect(awayNoticeLine(null, AWAY, said("Arin?"))).toBeNull();
  });

  it("reads the latest in-character line: an OOC line after it is no turn, and an older address is not this turn", () => {
    expect(awayNoticeLine(STORY, AWAY, said("Arin, wait for me.", "((brb))"))).toContain("Arin is not here");
    expect(awayNoticeLine(STORY, AWAY, said("Arin, wait for me.", "I look around the market."))).toBeNull();
  });

  it("an alias two members share resolves to nobody, so it adds no line", () => {
    const shared = storyWith({ arin: ["the guide"], narrator: ["the guide"] });
    expect(awayNoticeLine(shared, AWAY, said("I wave to the guide."))).toBeNull();
    expect(addressedAmong(shared.roster, ["arin"], "I wave to the guide.")).toEqual([]);
    expect(addressedAmong(STORY.roster, ["arin"], "I wave to the guide.").map((member) => member.rosterId)).toEqual(["arin"]);
  });

  it("only looks among the ids it is given: a present member addressed by name adds nothing", () => {
    expect(addressedAmong(STORY.roster, ["arin"], "DM Narrator, describe the street.")).toEqual([]);
  });
});

describe("the away notice block", () => {
  const harness = (line: string | null) => {
    const set = jest.fn();
    const clear = jest.fn();
    return { set, clear, notice: createAwayNotice({ line: () => line, set, clear }) };
  };

  it("rides one loud generation as a shared depth-0 block and is cleared when it closes", () => {
    const { set, clear, notice } = harness("Arin is not here.");
    notice.opened("normal");
    expect(set).toHaveBeenCalledWith(INJECTION_REGISTRY.awayNotice.key, "Arin is not here.", 0);
    notice.closed();
    expect(clear).toHaveBeenCalledWith(INJECTION_REGISTRY.awayNotice.key);
  });

  it("is never set for a quiet or impersonate pass, and touches no prompt when nobody away is addressed (byte-identical)", () => {
    for (const type of ["quiet", "impersonate"]) {
      const { set, notice } = harness("Arin is not here.");
      notice.opened(type);
      expect(set).not.toHaveBeenCalled();
    }
    const { set, clear, notice } = harness(null);
    notice.opened("normal");
    notice.closed();
    expect(set).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});

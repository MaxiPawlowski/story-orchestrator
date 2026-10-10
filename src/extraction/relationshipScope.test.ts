import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, type BlackboardSnapshot } from "@engine/index";
import { deriveScopeExplained, scopeOverflow } from "./scope";
import { CARD_SOURCE, QUEST_SOURCE, readScopeSource, RELATIONSHIP_SOURCE, REL_AXES_PER_READ } from "./scopeSources";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")) as Record<string, unknown> & { roster: Array<Record<string, unknown>> };
const STORY = parseStoryV2OrThrow(RAW);
const board = (values: BlackboardSnapshot["values"] = {}): BlackboardSnapshot => ({ values, versions: {}, latched: {} });
const keys = (present: string[], values: BlackboardSnapshot["values"] = {}) =>
  deriveScopeExplained(STORY, "start", board(values), [], { present, drafted: present[0] ?? null }).map((entry) => entry.key);

describe("v2.7 plan 37 L1 (F20): relationships are read by presence, not by gates", () => {
  it("pulls an axis no transition reads while both sides are present, and drops it when one leaves", () => {
    expect(keys(["arin", "narrator"])).toContain("rel_arin_narrator_respect");
    expect(keys(["arin"])).not.toContain("rel_arin_narrator_respect");
    expect(keys(["narrator"]).filter((key) => key.startsWith("rel_"))).toEqual(["rel_arin_player_trust"]);
  });

  it("marks the pull as a relationship", () => {
    const row = deriveScopeExplained(STORY, "start", board(), [], { present: ["arin", "narrator"] }).find((entry) => entry.key === "rel_arin_narrator_respect");
    expect(row?.pulledBy.map((pull) => pull.kind)).toEqual(["relationship"]);
  });

  it("caps the source and names the overflow for the author", () => {
    const axes = Array.from({ length: REL_AXES_PER_READ + 2 }, (_, index) => `axis${String.fromCharCode(97 + index)}`);
    const wide = parseStoryV2OrThrow({ ...RAW, transitions: [], roster: [{ ...RAW.roster[0], relationships: [{ toward: "player", axes }] }, RAW.roster[1]] });
    const read = readScopeSource(RELATIONSHIP_SOURCE, wide, board(), {});
    expect(read.keys).toHaveLength(REL_AXES_PER_READ);
    expect(read.dropped.length).toBeGreaterThanOrEqual(2);
    const overflow = scopeOverflow(wide, "start", board()).find((row) => row.kind === "relationship")?.dropped ?? [];
    const carried = new Set(deriveScopeExplained(wide, "start", board()).map((entry) => entry.key));
    expect(overflow.length).toBeGreaterThanOrEqual(read.dropped.length);
    expect([...read.keys, ...read.dropped].every((key) => carried.has(key) !== overflow.includes(key))).toBe(true);
  });

  it("adds nothing to a story without relationships (control: the same scope as without the source)", () => {
    const plain = parseStoryV2OrThrow({ ...RAW, transitions: [], clock: undefined, roster: [{ id: "arin", name: "Arin" }, { id: "narrator", name: "DM Narrator" }] });
    const withSource = deriveScopeExplained(plain, "start", board(), [], { present: ["arin"] });
    const without = deriveScopeExplained(plain, "start", board(), [], { present: ["arin"] }, [CARD_SOURCE, QUEST_SOURCE]);
    expect(withSource).toEqual(without);
  });

  it("adds an absent member's axis only in the negative control", () => {
    const planted = deriveScopeExplained(STORY, "start", board(), [], { present: ["narrator"] }).map((entry) => entry.key);
    expect(planted).not.toContain("rel_arin_narrator_respect");
  });
});

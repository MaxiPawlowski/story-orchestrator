import type { Quality } from "@engine/index";
import { applyRatingGrounding } from "./ratingGuard";
import type { ParsedDelta } from "./types";

const RANKS = ["E-rank", "D-rank", "C-rank", "B-rank", "A-rank", "S-rank"].map((label, index) => ({ value: index + 1, label }));

const partyRank: Quality = {
  key: "party_rank",
  type: "int",
  source: "extractor",
  monotonic: true,
  read_as: "rating",
  criteria: { levels: RANKS },
  rubric: "What Adventurer's Guild rank does the party hold now, as the story has stated it?",
};

const reputation: Quality = {
  key: "guild_reputation",
  type: "int",
  source: "extractor",
  read_as: "rating",
  criteria: { levels: [{ value: 1, label: "unknown: one more new party" }, { value: 2, label: "reliable: finishes what it takes" }] },
  rubric: "How does the Guild regard the party?",
};

const qualities = { party_rank: partyRank, guild_reputation: reputation };

const delta = (q: string, v: number, evidence: string): ParsedDelta => ({ delta: { q, v, source: "extractor" }, evidence });

describe("T0-2: a monotonic rating moves only on evidence that names the level, one level at a time (v2.6 plan 14)", () => {
  it("holds the invented D-rank: the quote names a D-rank posting, and the party was F-rank one boundary before", () => {
    const result = applyRatingGrounding(qualities, { party_rank: 0 }, [delta("party_rank", 2, "The Ash Lanterns, your party of three, just took a D-rank posting from the Adventurer's Guild")]);
    expect(result.accepted).toEqual([]);
    expect(result.held).toEqual([expect.objectContaining({ key: "party_rank", value: "2", reason: expect.stringMatching(/skips/) })]);
  });

  it("holds a level the evidence never names (the judged read that cited the Guild hall's noise)", () => {
    const result = applyRatingGrounding(qualities, { party_rank: 0 }, [delta("party_rank", 1, "The Guild hall is loud enough to be heard from the street.")]);
    expect(result.accepted).toEqual([]);
    expect(result.held[0]).toMatchObject({ key: "party_rank", value: "1", reason: expect.stringMatching(/E-rank/) });
  });

  it("accepts the next level when the evidence names it", () => {
    const result = applyRatingGrounding(qualities, { party_rank: 0 }, [delta("party_rank", 1, "Ellie stamps your badges: the Guild promotes you to E-rank.")]);
    expect(result.held).toEqual([]);
    expect(result.accepted).toHaveLength(1);
  });

  it("accepts a first reading at any level when nothing was known, as long as the evidence names it", () => {
    expect(applyRatingGrounding(qualities, {}, [delta("party_rank", 3, "We're a C-rank party, show some respect.")]).accepted).toHaveLength(1);
    expect(applyRatingGrounding(qualities, {}, [delta("party_rank", 3, "We're a proper party, show some respect.")]).held).toHaveLength(1);
  });

  it("leaves a non-monotonic rating and every other quality alone", () => {
    const others = [delta("guild_reputation", 2, "Tobias nods at you."), { delta: { q: "location", v: "north_road", source: "extractor" }, evidence: "The road." } as ParsedDelta];
    expect(applyRatingGrounding(qualities, { guild_reputation: 0 }, others)).toEqual({ accepted: others, held: [] });
  });
});

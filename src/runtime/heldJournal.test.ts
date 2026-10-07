import { HELD_QUOTE_CHARS, heldNote } from "./heldJournal";

describe("v2.7 plan 09 E: the author's journal row for a held reading", () => {
  it("carries the player's line and the hold reason beside the reader's quote", () => {
    expect(heldNote([{ key: "adv_path", value: "wendhope", evidence: "Tobias offers the posting.", reason: "negated", playerLine: "I don't see why we wouldn't take it." }]))
      .toBe("adv_path=\"wendhope\" (negated) from \"Tobias offers the posting.\", the player wrote \"I don't see why we wouldn't take it.\"");
  });

  it("keeps the rating row's shape when there is no player line", () => {
    expect(heldNote([{ key: "party_rank", value: "2", evidence: "they rose", reason: "skips E-rank" }, { key: "x", value: "y", evidence: "z" }]))
      .toBe("party_rank=\"2\" (skips E-rank) from \"they rose\"; x=\"y\" from \"z\"");
  });

  it("cuts both quotes at the same length", () => {
    const long = "a".repeat(HELD_QUOTE_CHARS + 40);
    const note = heldNote([{ key: "k", value: "v", evidence: long, playerLine: long }]);
    expect(note.match(/"a+"/g)?.map((quoted) => quoted.length - 2)).toEqual([HELD_QUOTE_CHARS, HELD_QUOTE_CHARS]);
  });
});

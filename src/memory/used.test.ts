import {
  createMentions, heldForMember, MENTION_HOLD_BOUNDARIES, MENTION_RECORD_CAP, raisedBy, recordMentions, rollbackMentions, sanitizeMentions, usedInReply, type OfferedItem,
} from "./used";

const items: OfferedItem[] = [
  { id: "f1", kind: "row", text: "Mira hid the silver key under the loose floorboard in the chapel", triggers: ["silver key"] },
  { id: "f2", kind: "row", text: "The ferryman charges double after dark", triggers: [] },
  { id: "a1", kind: "arc", text: "Find out who burned the granary" },
  { id: "line:x", kind: "line", text: "Ask the player about the letter from the duke" },
];

describe("v3.0 41 B1: which offered lines a reply used", () => {
  it("a reply restating a row's distinctive words uses it; an unrelated reply uses nothing", () => {
    expect(usedInReply(items, "I put the silver key under the floorboard of the chapel, nobody looks there.", ["Mira"])).toEqual(["f1"]);
    expect(usedInReply(items, "The weather has turned cold.", ["Mira"])).toEqual([]);
  });

  it("the speaker's own name is not evidence: a row about her needs its other words", () => {
    expect(usedInReply([{ id: "f3", kind: "row", text: "Mira sings", triggers: [] }], "Mira laughs at the idea.", ["Mira"])).toEqual([]);
  });

  it("an activation trigger in the reply counts, a short one never does", () => {
    expect(usedInReply(items, "Keep your voice down about the silver key.", ["Mira"])).toEqual(["f1"]);
    expect(usedInReply([{ id: "t", kind: "row", text: "unrelated words here", triggers: ["ox"] }], "The ox is tired.", [])).toEqual([]);
  });

  it("arcs and private lines are detected like rows", () => {
    expect(usedInReply(items, "Someone burned the granary, and I mean to find out who.", ["Arin"])).toEqual(["a1"]);
    expect(usedInReply(items, "Tell me about the letter from the duke.", ["Arin"])).toEqual(["line:x"]);
  });

  it("an empty reply uses nothing, and an id offered twice is reported once", () => {
    expect(usedInReply(items, "   ", [])).toEqual([]);
    expect(usedInReply([items[1], items[1]], "The ferryman charges double after dark, everyone knows.", [])).toEqual(["f2"]);
  });
});

describe("v3.0 41 B1: the mention record is keyed by message and revision, and rolls back", () => {
  const at = (messageId: number, boundary = messageId, member = "mira", revision = "-.h") => ({ member, messageId, revision, boundary });

  it("a second detection of the same reply replaces the first instead of adding to it", () => {
    let state = recordMentions(createMentions(), ["f1"], items, at(5));
    state = recordMentions(state, ["f2"], items, at(5, 5, "mira", "1.h2"));
    expect(state.records.map((record) => [record.id, record.revision])).toEqual([["f2", "1.h2"]]);
  });

  it("rollback drops records at or after the message, keeps earlier ones", () => {
    let state = recordMentions(createMentions(), ["f1"], items, at(3));
    state = recordMentions(state, ["f2"], items, at(7));
    expect(rollbackMentions(state, 7).records.map((record) => record.id)).toEqual(["f1"]);
    expect(rollbackMentions(state, 3).records).toEqual([]);
  });

  it("ids not offered are not recorded, and the ring is capped", () => {
    expect(recordMentions(createMentions(), ["nope"], items, at(1)).records).toEqual([]);
    let state = createMentions();
    for (let index = 0; index < MENTION_RECORD_CAP + 20; index += 1) state = recordMentions(state, ["f1"], items, at(index));
    expect(state.records).toHaveLength(MENTION_RECORD_CAP);
    expect(state.records[0].messageId).toBe(20);
  });

  it("sanitize keeps only well-formed records", () => {
    const good = { id: "f1", kind: "row", member: "m", messageId: 1, revision: "r", boundary: 1 };
    expect(sanitizeMentions({ records: [good, { ...good, kind: "nope" }, { ...good, messageId: 1.5 }, null] }).records).toEqual([good]);
    expect(sanitizeMentions(undefined)).toEqual({ records: [] });
  });
});

describe("v3.0 41 B2: a row a member said is held back for that member only", () => {
  const state = recordMentions(createMentions(), ["f1", "a1"], items, { member: "mira", messageId: 4, revision: "r", boundary: 4 });

  it("held for the speaker within the window, never for another member, never an arc", () => {
    expect([...heldForMember(state, "mira", 4, () => false)]).toEqual(["f1"]);
    expect([...heldForMember(state, "mira", 4 + MENTION_HOLD_BOUNDARIES - 1, () => false)]).toEqual(["f1"]);
    expect([...heldForMember(state, "mira", 4 + MENTION_HOLD_BOUNDARIES, () => false)]).toEqual([]);
    expect([...heldForMember(state, "arin", 4, () => false)]).toEqual([]);
  });

  it("released when the player raises it", () => {
    expect([...heldForMember(state, "mira", 5, (id) => id === "f1")]).toEqual([]);
  });

  it("raisedBy: the player's words or a topical entity raise a row; a cast name alone does not", () => {
    const probe = { text: "Mira hid the silver key under the loose floorboard in the chapel", entities: ["Mira", "chapel"], triggers: ["silver key"] };
    expect(raisedBy(probe, "Where is the silver key?", ["Mira"])).toBe(true);
    expect(raisedBy(probe, "Let's go back to the chapel.", ["Mira"])).toBe(true);
    expect(raisedBy(probe, "Mira, how are you?", ["Mira"])).toBe(false);
    expect(raisedBy(probe, "", ["Mira"])).toBe(false);
  });
});

import {
  copiedRun, e0Agreed, e0CheckerPrompt, e0JsonObject, e0Transcript, e0WriterPrompt, e0WrittenProblem, mergeE0Labels, readE0Check, readE0Written, selectE0Sessions,
  type E0LabelDraft,
} from "./e0Labels";
import { readE0Labels, type E0ChatRow } from "./e0Pool";

const chat = (count: number, tag = "m"): E0ChatRow[] => Array.from({ length: count }, (_, id) => ({ id, name: id % 3 === 0 ? "Wren" : "Tobin", isUser: id % 3 === 0, text: `${tag} line ${id} about the axle and the rope` }));

const written = (overrides: Partial<E0LabelDraft["written"]> = {}): E0LabelDraft["written"] => ({ askMessageId: 30, asker: "Wren", text: "What did Tobin call the bridge?", gold: [10], ...overrides });

describe("E0 private labels", () => {
  it("selects sessions by length and drops a copy that shares most of its text with a longer kept one", () => {
    const long = chat(60, "a");
    const copy = [...long.slice(0, 45), ...chat(5, "c")];
    const picked = selectE0Sessions([{ session: "copy", rows: copy }, { session: "long", rows: long }, { session: "short", rows: chat(20, "s") }, { session: "other", rows: chat(41, "o") }]);
    expect(picked).toEqual({ kept: ["long", "other"], short: ["short"], duplicate: ["copy"] });
  });

  it("transcripts mark ids and player turns and stop before the asking turn", () => {
    const rows = chat(5);
    expect(e0Transcript(rows, 2)).toBe("[0] Wren (player): m line 0 about the axle and the rope\n\n[1] Tobin: m line 1 about the axle and the rope");
    expect(e0WriterPrompt(rows, 3)).toContain("Write 3 test questions");
    const check = e0CheckerPrompt(rows, [{ key: "q1", written: written({ askMessageId: 3 }) }, { key: "q2", written: written({ askMessageId: 2, asker: "" }) }]);
    expect(check).toContain("- key q1, askMessageId 3, asked by Wren: What did Tobin call the bridge?");
    expect(check).toContain("- key q2, askMessageId 2, asked by the player:");
    expect(check).toContain("[2] Tobin");
    expect(check).not.toContain("[3]");
  });

  it("parses the first JSON object and reads only well-formed rows", () => {
    expect(e0JsonObject("noise {\"a\": 1} tail")).toEqual({ a: 1 });
    expect(e0JsonObject("no json")).toBeNull();
    expect(readE0Written({ questions: [{ askMessageId: 30, asker: "W", text: " q ", gold: [3] }, { askMessageId: "x", text: "q", gold: [1] }, { askMessageId: 3, text: "q", gold: ["1"] }] })).toEqual([{ askMessageId: 30, asker: "W", text: "q", gold: [3] }]);
    expect(readE0Check({ answerable: true, ids: [4] })).toEqual({ answerable: true, ids: [4] });
    expect(readE0Check({ ids: [4] })).toBeNull();
  });

  it("refuses a written question whose ask turn, gold or wording breaks the rules", () => {
    const rows = chat(40);
    expect(e0WrittenProblem(rows, written())).toBeNull();
    expect(e0WrittenProblem(rows, written({ askMessageId: 31 }))).toBe("asking turn is not a player message");
    expect(e0WrittenProblem(rows, written({ askMessageId: 99 }))).toBe("asking turn is not a message");
    expect(e0WrittenProblem(rows, written({ gold: [27] }))).toMatch(/inside protect/);
    expect(e0WrittenProblem(rows, written({ askMessageId: 9, gold: [1] }))).toMatch(/under 8/);
    expect(e0WrittenProblem(rows, written({ gold: [1, 2, 3] }))).toMatch(/1-2 allowed/);
    expect(e0WrittenProblem(rows, written({ text: "Who said line 10 about the axle?" }))).toMatch(/copies 5\+/);
    expect(copiedRun("what about the axle", "line 10 about the axle and the rope")).toBe(false);
  });

  it("agrees only when the blind checker finds the question answerable inside the gold ids", () => {
    expect(e0Agreed([10, 11], { answerable: true, ids: [11] })).toBe(true);
    expect(e0Agreed([10], { answerable: true, ids: [10, 12] })).toBe(false);
    expect(e0Agreed([10], { answerable: false, ids: [10] })).toBe(false);
    expect(e0Agreed([10], { answerable: true, ids: [] })).toBe(false);
  });

  it("merges drafts into a private label set the review rule reads, counting every drop", () => {
    const rows = chat(40);
    const drafts: E0LabelDraft[] = [
      { id: "s1-1", session: "s1", written: written(), check: { answerable: true, ids: [10] } },
      { id: "s1-2", session: "s1", written: written({ gold: [12] }), check: { answerable: true, ids: [13] } },
      { id: "s1-3", session: "s1", written: written({ askMessageId: 31 }), check: { answerable: true, ids: [10] } },
      { id: "s1-4", session: "s1", written: written({ gold: [14] }), check: null },
      { id: "s2-1", session: "s2", written: written(), check: { answerable: true, ids: [10] } },
    ];
    const merged = mergeE0Labels(drafts, new Map([["s1", rows]]), "sol", "claude");
    expect(merged.counts).toEqual({ written: 5, invalid: 2, unchecked: 1, agreed: 1, disagreed: 1 });
    expect(merged.invalid.map((entry) => entry.id)).toEqual(["s1-3", "s2-1"]);
    const read = readE0Labels(merged.labels);
    expect(read.questions.map((entry) => entry.id)).toEqual(["s1-1"]);
    expect(read.dropped).toEqual({ disagreed: 1, invalid: [] });
  });
});

import { wordDiff, WORD_DIFF_MAX_CELLS } from "./wordDiff";

const render = (parts: ReturnType<typeof wordDiff>) => parts.map((part) => (part.kind === "same" ? part.text : part.kind === "del" ? `[-${part.text}-]` : `{+${part.text}+}`)).join("");

describe("wordDiff (v2.4 plan 06 T17.4)", () => {
  it("marks only the words that changed, keeping whitespace", () => {
    expect(render(wordDiff("The bridge stands, its ropes new.", "The bridge fell, its ropes cut."))).toBe("The bridge [-stands,-]{+fell,+} its ropes [-new.-]{+cut.+}");
  });

  it("reads a multi-word change as one deletion and one insertion, not word-by-word fragments", () => {
    expect(render(wordDiff("The wards hold the gate until dawn.", "The wards are broken."))).toBe("The wards [-hold the gate until dawn.-]{+are broken.+}");
    expect(render(wordDiff("a b c d", "a x c y"))).toBe("a [-b-]{+x+} c [-d-]{+y+}");
  });

  it("round-trips both sides", () => {
    const before = "Nobody has seen the ferryman for a season.";
    const after = "The ferryman is back, poling a flat skiff, for a season.";
    const parts = wordDiff(before, after);
    expect(parts.filter((part) => part.kind !== "ins").map((part) => part.text).join("")).toBe(before);
    expect(parts.filter((part) => part.kind !== "del").map((part) => part.text).join("")).toBe(after);
  });

  it("reports an identical text as one unchanged run and an empty side as a whole insert", () => {
    expect(wordDiff("same text", "same text")).toEqual([{ kind: "same", text: "same text" }]);
    expect(wordDiff("", "new")).toEqual([{ kind: "ins", text: "new" }]);
  });

  it("falls back to a whole replace past its size bound instead of stalling the drawer", () => {
    const long = Array.from({ length: Math.ceil(Math.sqrt(WORD_DIFF_MAX_CELLS)) + 10 }, (_, index) => `w${index}`).join(" ");
    expect(wordDiff(long, `${long} tail`)).toEqual([{ kind: "del", text: long }, { kind: "ins", text: `${long} tail` }]);
  });
});

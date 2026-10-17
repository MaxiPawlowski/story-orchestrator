import { foldTerm, termPresent } from "./termPresent";

describe("termPresent: one matcher for the self-test and the live-suite scorers (v2.8 35 G1)", () => {
  it("term mode needs a whole term: 'bel' is not in 'below', 'arm' is not in 'harm'", () => {
    expect(termPresent("She walks below the bridge.", "bel")).toBe(false);
    expect(termPresent("Bel walks below the bridge.", "bel")).toBe(true);
    expect(termPresent("no harm done", "arm")).toBe(false);
    expect(termPresent("left_arm=wounded", "arm")).toBe(true);
  });

  it("folds curly quotes and dashes on both sides", () => {
    expect(termPresent("I don’t know", "don't")).toBe(true);
    expect(termPresent("I don't know", "don’t")).toBe(true);
    expect(termPresent("a pause - then", "—")).toBe(true);
    expect(termPresent("“quoted”", "\"quoted\"")).toBe(true);
  });

  it("prefix mode keeps today's word-start match: 'wound' in 'wounded', never mid-word", () => {
    expect(termPresent("his wounded arm", "wound", "prefix")).toBe(true);
    expect(termPresent("his wounded arm", "wound")).toBe(false);
    expect(termPresent("the unwounded", "wound", "prefix")).toBe(false);
  });

  it("is case-insensitive, NFKC-normalised, and a needle ending in punctuation needs no right boundary", () => {
    expect(termPresent("MARA trusts Max", "mara")).toBe(true);
    expect(termPresent("Ｍａｒａ left", "mara")).toBe(true);
    expect(termPresent("location=tunnel", "location=")).toBe(true);
    expect(foldTerm("‘a’ – b")).toBe("'a' - b");
  });
});

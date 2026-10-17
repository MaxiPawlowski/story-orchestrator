import { jaccardSimilarity, similarityTokens } from "./similarity";

describe("jaccard tokens (plan 69 K7)", () => {
  it("strips punctuation at token edges only", () => {
    expect(jaccardSimilarity("Mara.", "Mara")).toBe(1);
    expect(jaccardSimilarity("\"Mara,\" she said!", "mara she said")).toBe(1);
    expect(jaccardSimilarity("(the key)", "the key")).toBe(1);
  });

  it("folds curly quotes", () => {
    expect(jaccardSimilarity("don’t go", "don't go")).toBe(1);
    expect(jaccardSimilarity("“Mara”", "\"Mara\"")).toBe(1);
  });

  it("keeps inner punctuation inside one token", () => {
    expect([...similarityTokens("don't co-op 3.5")]).toEqual(["don't", "co-op", "3.5"]);
    expect([...similarityTokens("'don't' (co-op) 3.5.")]).toEqual(["don't", "co-op", "3.5"]);
  });

  it("drops tokens that are only punctuation", () => {
    expect([...similarityTokens("Mara — the key")]).toEqual(["mara", "the", "key"]);
  });

  it("never merges tokens that differ only by inner punctuation", () => {
    const planted: Array<[string, string]> = [
      ["don't", "dont"],
      ["co-op", "coop"],
      ["3.5", "35"],
      ["re-cover", "recover"],
      ["it's", "its"],
      ["e.g", "eg"],
    ];
    const merges = planted.filter(([a, b]) => jaccardSimilarity(a, b) > 0);
    expect(merges).toEqual([]);
  });
});

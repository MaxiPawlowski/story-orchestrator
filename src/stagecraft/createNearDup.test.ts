import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_DEDUP_THRESHOLDS } from "@memory/index";
import { trigramJaccard, CREATE_NEAR_DUP_TRIGRAM_BANDS, CREATE_NEAR_DUP_VECTOR_BANDS, nearDupAdvice, vectorNearDups, wordingNearDups, wordingScore, type NearDupSubject } from "./createNearDup";
import type { CuratorEntryView } from "./types";

interface Pair {
  id: string;
  label: "duplicate" | "same-topic" | "distinct";
  candidate: NearDupSubject;
  entry: NearDupSubject;
}

const fixture = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/curator-create/near-dup.json"), "utf-8")) as {
  vectorBands: { duplicate: number; sameTopic: number };
  trigramBands: { duplicate: number; sameTopic: number };
  pairs: Pair[];
};

const view = (subject: NearDupSubject, uid = 0): CuratorEntryView => ({ lorebook: "Story Lore", comment: subject.comment, keys: subject.keys, content: subject.content, disabled: false, uid });
const bandOf = (pair: Pair) => wordingNearDups(pair.candidate, [view(pair.entry)])[0]?.band ?? "distinct";
const of = (label: Pair["label"]) => fixture.pairs.filter((pair) => pair.label === label);

describe("v2.8 A15: the create card's near-duplicate check reads meaning, not shared prose", () => {
  it("declares its bands: vectors are consolidation's, the wording bands are the fixture's", () => {
    expect(CREATE_NEAR_DUP_VECTOR_BANDS).toEqual({ duplicate: DEFAULT_DEDUP_THRESHOLDS.cosineDup, sameTopic: DEFAULT_DEDUP_THRESHOLDS.cosineSameTopic });
    expect(fixture.vectorBands).toEqual(CREATE_NEAR_DUP_VECTOR_BANDS);
    expect(fixture.trigramBands).toEqual(CREATE_NEAR_DUP_TRIGRAM_BANDS);
    expect(of("duplicate").length).toBeGreaterThanOrEqual(6);
    expect(of("distinct").length).toBeGreaterThanOrEqual(6);
  });

  it("flags every reworded duplicate and no distinct pair; most same-topic pairs are flagged too", () => {
    expect(of("duplicate").filter((pair) => bandOf(pair) === "distinct").map((pair) => pair.id)).toEqual([]);
    expect(of("distinct").filter((pair) => bandOf(pair) !== "distinct").map((pair) => pair.id)).toEqual([]);
    expect(of("same-topic").filter((pair) => bandOf(pair) !== "distinct").length).toBeGreaterThanOrEqual(3);
    expect(of("duplicate").filter((pair) => bandOf(pair) === "duplicate").length).toBeGreaterThanOrEqual(3);
  });

  it("control: the shipped whole-text trigram at 0.85 caught none of the reworded duplicates", () => {
    const old = (pair: Pair) => trigramJaccard(`${pair.candidate.comment} ${pair.candidate.content}`, `${pair.entry.comment} ${pair.entry.content}`) >= 0.85;
    expect(of("duplicate").filter(old)).toEqual([]);
  });

  it("ranks a duplicate above a same-topic match and keeps at most three", () => {
    const [first] = of("duplicate");
    const entries = [view(of("same-topic")[0].entry, 1), view(first.entry, 2), ...of("duplicate").slice(1).map((pair, index) => view(pair.entry, 3 + index))];
    const found = wordingNearDups(first.candidate, entries);
    expect(found.length).toBeLessThanOrEqual(3);
    expect(found[0]).toMatchObject({ comment: first.entry.comment, via: "wording" });
    expect(wordingScore(first.candidate, first.candidate)).toBe(1);
  });

  it("maps the two vector bands, duplicate first", () => {
    const entries = [view({ comment: "A", keys: [], content: "" }, 0), view({ comment: "B", keys: [], content: "" }, 1), view({ comment: "C", keys: [], content: "" }, 2)];
    expect(vectorNearDups(entries, new Set([1]), new Set([0, 1]))).toEqual([
      { comment: "B", score: 0.82, band: "duplicate", via: "vectors" },
      { comment: "A", score: 0.55, band: "same-topic", via: "vectors" },
    ]);
  });

  it("tells the author to patch the existing entry instead", () => {
    expect(nearDupAdvice({ comment: "The Warden", score: 0.82, band: "duplicate", via: "vectors" })).toBe("Looks like “The Warden” (same meaning). Patch “The Warden” instead?");
    expect(nearDupAdvice({ comment: "The Harbor", score: 0.3, band: "same-topic", via: "wording" })).toContain("A patch to “The Harbor” may be enough");
    expect(nearDupAdvice({ comment: "Old", score: 0.87 })).toBe("may duplicate “Old” (87% alike)");
  });
});

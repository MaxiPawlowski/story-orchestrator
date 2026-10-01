import { PAIR_JACCARD_FLOOR } from "@judge/index";
import { a0Arm, classCounts, jaccardBand, loadCosineBrackets, loadK0, ordinaryOutcome, rowsSha256, scoreK0, type BandArm } from "../../test/support/contradictions";
import { establishedBands } from "./conflicts";
import { opposedPolarity } from "./polarity";

const n1Arm: BandArm = (group, vectors) => establishedBands(group, vectors, PAIR_JACCARD_FLOOR);

const fixture = loadK0();

describe("K0 contradiction fixture", () => {
  it("is frozen: the rows hash to the recorded sha256", () => {
    expect(fixture.fixtureFrozenAt).toBe("2026-09-26");
    expect(rowsSha256(fixture.rows)).toBe(fixture.rowsSha256);
    expect(fixture.rowsSha256).toBe("c7b0045bf0a304b2e2c230309711b756b9f4e6e5d540b7c84b0c36df8350af3d");
  });

  it("carries the planned class table (21 en; the 14 es rows went with v2.6 W25)", () => {
    const table = fixture.rows.reduce<Record<string, number>>((counts, row) => {
      const key = `${row.label}${row.form ? `:${row.form}` : ""}:${row.lang}`;
      return { ...counts, [key]: (counts[key] ?? 0) + 1 };
    }, {});
    expect(table).toEqual({
      "contradicts:plain:en": 7,
      "contradicts:negation:en": 4,
      "agrees:en": 5,
      "update:en": 2,
      "distinct:en": 3,
    });
    expect(fixture.rows).toHaveLength(21);
  });

  it("records every row's Jaccard band as the held-group bands compute it", () => {
    expect(fixture.rows.filter((row) => jaccardBand(row) !== row.band.jaccard).map((row) => row.id)).toEqual([]);
  });

  it("fixes the Jaccard-mode class counts, with 4 in-band agreeing rows", () => {
    expect(classCounts(fixture, { kind: "jaccard" })).toEqual({
      "contradicts:plain:in": 4,
      "contradicts:negation:below": 4,
      "contradicts:plain:below": 3,
      "agrees:in": 4,
      "agrees:below": 1,
      "update:in": 1,
      "update:below": 1,
      "distinct:in": 3,
    });
  });

  it("covers every row in every recorded cosine bracket file", () => {
    for (const brackets of loadCosineBrackets()) expect(fixture.rows.filter((row) => typeof brackets.rows[row.id] !== "number").map((row) => row.id)).toEqual([]);
  });
});

describe("A0: today's bands on K0", () => {
  it("scores the Jaccard-only mode: every in-band contradiction held, nothing below the band", () => {
    const score = scoreK0(fixture, a0Arm, { kind: "jaccard" });
    expect(score.held).toEqual(["K01", "K02", "K03", "K04", "K21", "K22", "K23", "K24", "K31", "K32", "K33"]);
    expect([score.recall.all.hit, score.recall.all.total]).toEqual([4, 11]);
    expect([score.recall.inBand.hit, score.recall.inBand.total]).toEqual([4, 4]);
    expect([score.recall.belowBand.hit, score.recall.belowBand.total]).toEqual([0, 7]);
    expect([score.recall.belowNegation.hit, score.recall.belowNegation.total]).toEqual([0, 4]);
    expect([score.falseHold.all.hit, score.falseHold.all.total]).toEqual([7, 8]);
    expect(score.update.ids).toEqual([]);
  });

  it("replays recorded cosines through the vectors union: a cosine below every band changes nothing", () => {
    const flat = Object.fromEntries(fixture.rows.map((row) => [row.id, 0]));
    expect(scoreK0(fixture, a0Arm, { kind: "vectors", cosine: flat })).toEqual(scoreK0(fixture, a0Arm, { kind: "jaccard" }));
  });

  it("replays recorded cosines through the vectors union: a cosine in the same-topic band joins a pair Jaccard misses", () => {
    const flat = Object.fromEntries(fixture.rows.map((row) => [row.id, row.id === "K15" ? 0.6 : 0]));
    const score = scoreK0(fixture, a0Arm, { kind: "vectors", cosine: flat });
    expect(score.held).toContain("K15");
    expect(score.recall.belowPlain.total).toBe(2);
  });
});

describe("O1 measurement: K0 recast as ordinary rows, consolidated in an 8-row group", () => {
  const outcomes = new Map(fixture.rows.map((row) => [row.id, ordinaryOutcome(row, { kind: "jaccard" })]));
  const ids = (predicate: (id: string) => boolean) => [...outcomes.keys()].filter(predicate);

  it("Jaccard-only mode: every in-band contradiction gets today's soft mark, every below-band one gets nothing", () => {
    const contradicts = fixture.rows.filter((row) => row.label === "contradicts");
    expect(contradicts.filter((row) => row.band.jaccard !== "below").map((row) => outcomes.get(row.id))).toEqual(Array(4).fill("soft-mark"));
    expect(contradicts.filter((row) => row.band.jaccard === "below").map((row) => outcomes.get(row.id))).toEqual(Array(7).fill("none"));
  });

  it("Jaccard-only mode: the band cannot tell agreement from contradiction for ordinary rows either", () => {
    expect(ids((id) => outcomes.get(id) === "soft-mark")).toEqual(["K01", "K02", "K03", "K04", "K21", "K22", "K23", "K24", "K31", "K32", "K33"]);
    expect(ids((id) => outcomes.get(id) === "superseded")).toEqual(["K28"]);
  });
});

describe("N1: the polarity screen on K0, against its predeclared floor", () => {
  const a0 = scoreK0(fixture, a0Arm, { kind: "jaccard" });
  const n1 = scoreK0(fixture, n1Arm, { kind: "jaccard" });

  it("Jaccard-only mode: below-band explicit-negation recall 4/4, in-band recall unchanged", () => {
    expect([n1.recall.belowNegation.hit, n1.recall.belowNegation.total]).toEqual([4, 4]);
    expect(n1.recall.belowNegation.hit / n1.recall.belowNegation.total).toBeGreaterThanOrEqual(0.6);
    expect([n1.recall.inBand.hit, n1.recall.inBand.total]).toEqual([4, 4]);
    expect([n1.recall.belowPlain.hit, n1.recall.belowPlain.total]).toEqual([0, 3]);
    expect(n1.recall.all.hit).toBe(8);
  });

  it("Jaccard-only mode: no more false holds than A0 (K35, the one extra, was Spanish and went with v2.6 W25), within A0 + 1", () => {
    expect(n1.falseHold.all.ids.filter((id) => !a0.falseHold.all.ids.includes(id))).toEqual([]);
    expect(n1.falseHold.all.hit).toBeLessThanOrEqual(a0.falseHold.all.hit + 1);
    expect(a0.held.filter((id) => !n1.held.includes(id))).toEqual([]);
    expect(n1.update.ids).toEqual(a0.update.ids);
  });

  it("vectors-present mode is bounded by text alone: the screen reads no cosine, and every Jaccard-band row is held in both modes", () => {
    const screened = fixture.rows.filter((row) => opposedPolarity(row.established, row.claim, PAIR_JACCARD_FLOOR));
    const negations = fixture.rows.filter((row) => row.label === "contradicts" && row.form === "negation");
    expect(negations.filter((row) => !screened.includes(row)).map((row) => row.id)).toEqual([]);
    const extraFalse = screened.filter((row) => (row.label === "agrees" || row.label === "distinct") && row.band.jaccard === "below");
    expect(extraFalse.map((row) => row.id)).toEqual([]);
  });

  it("replays a vectors mode through the same arm and keeps every A0 hold", () => {
    const cosine = Object.fromEntries(fixture.rows.map((row, index) => [row.id, index % 3 === 0 ? 0.6 : 0.3]));
    const a0Vectors = scoreK0(fixture, a0Arm, { kind: "vectors", cosine });
    const n1Vectors = scoreK0(fixture, n1Arm, { kind: "vectors", cosine });
    expect(a0Vectors.held.filter((id) => !n1Vectors.held.includes(id))).toEqual([]);
    expect(n1Vectors.recall.belowNegation.hit).toBe(n1Vectors.recall.belowNegation.total);
    expect(n1Vectors.falseHold.all.hit).toBeLessThanOrEqual(a0Vectors.falseHold.all.hit + 1);
  });
});

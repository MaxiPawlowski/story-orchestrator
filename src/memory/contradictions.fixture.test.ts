import { PAIR_JACCARD_FLOOR } from "@judge/index";
import { a0Arm, classCounts, jaccardBand, loadCosineBrackets, loadK0, rowsSha256, scoreK0, type BandArm } from "../../test/support/contradictions";
import { establishedBands } from "./conflicts";
import { opposedPolarity } from "./polarity";

const n1Arm: BandArm = (group, vectors) => establishedBands(group, vectors, PAIR_JACCARD_FLOOR);

const fixture = loadK0();

describe("K0 contradiction fixture", () => {
  it("is frozen: the rows hash to the recorded sha256", () => {
    expect(fixture.fixtureFrozenAt).toBe("2026-09-26");
    expect(rowsSha256(fixture.rows)).toBe(fixture.rowsSha256);
    expect(fixture.rowsSha256).toBe("c33d55e5ffd31376939a9044509a5b0e8f0a62909206a4733f25259140c1e513");
  });

  it("carries the planned class table (21 en, 14 es)", () => {
    const table = fixture.rows.reduce<Record<string, number>>((counts, row) => {
      const key = `${row.label}${row.form ? `:${row.form}` : ""}:${row.lang}`;
      return { ...counts, [key]: (counts[key] ?? 0) + 1 };
    }, {});
    expect(table).toEqual({
      "contradicts:plain:en": 7,
      "contradicts:plain:es": 4,
      "contradicts:negation:en": 4,
      "contradicts:negation:es": 4,
      "agrees:en": 5,
      "agrees:es": 2,
      "update:en": 2,
      "update:es": 2,
      "distinct:en": 3,
      "distinct:es": 2,
    });
    expect(fixture.rows.filter((row) => row.lang === "en")).toHaveLength(21);
    expect(fixture.rows.filter((row) => row.lang === "es")).toHaveLength(14);
  });

  it("records every row's Jaccard band as the held-group bands compute it", () => {
    expect(fixture.rows.filter((row) => jaccardBand(row) !== row.band.jaccard).map((row) => row.id)).toEqual([]);
  });

  it("fixes the Jaccard-mode class counts, with at least 5 in-band agreeing rows", () => {
    expect(classCounts(fixture, { kind: "jaccard" })).toEqual({
      "contradicts:plain:in": 6,
      "contradicts:negation:below": 8,
      "contradicts:plain:below": 5,
      "agrees:in": 6,
      "agrees:below": 1,
      "update:in": 2,
      "update:below": 2,
      "distinct:in": 4,
      "distinct:below": 1,
    });
  });

  it("covers every row in every recorded cosine bracket file", () => {
    for (const brackets of loadCosineBrackets()) expect(fixture.rows.filter((row) => typeof brackets.rows[row.id] !== "number").map((row) => row.id)).toEqual([]);
  });
});

describe("A0: today's bands on K0", () => {
  it("scores the Jaccard-only mode: every in-band contradiction held, nothing below the band", () => {
    const score = scoreK0(fixture, a0Arm, { kind: "jaccard" });
    expect(score.held).toEqual(["K01", "K02", "K03", "K04", "K05", "K06", "K21", "K22", "K23", "K24", "K25", "K26", "K30", "K31", "K32", "K33", "K34"]);
    expect([score.recall.all.hit, score.recall.all.total]).toEqual([6, 19]);
    expect([score.recall.es.hit, score.recall.es.total]).toEqual([2, 8]);
    expect([score.recall.inBand.hit, score.recall.inBand.total]).toEqual([6, 6]);
    expect([score.recall.belowBand.hit, score.recall.belowBand.total]).toEqual([0, 13]);
    expect([score.recall.belowNegation.hit, score.recall.belowNegation.total]).toEqual([0, 8]);
    expect([score.recall.belowNegationEs.hit, score.recall.belowNegationEs.total]).toEqual([0, 4]);
    expect([score.falseHold.all.hit, score.falseHold.all.total]).toEqual([10, 12]);
    expect([score.falseHold.es.hit, score.falseHold.es.total]).toEqual([3, 4]);
    expect(score.update.ids).toEqual(["K30"]);
  });

  it("replays recorded cosines through the vectors union: a cosine below every band changes nothing", () => {
    const flat = Object.fromEntries(fixture.rows.map((row) => [row.id, 0]));
    expect(scoreK0(fixture, a0Arm, { kind: "vectors", cosine: flat })).toEqual(scoreK0(fixture, a0Arm, { kind: "jaccard" }));
  });

  it("replays recorded cosines through the vectors union: a cosine in the same-topic band joins a pair Jaccard misses", () => {
    const flat = Object.fromEntries(fixture.rows.map((row) => [row.id, row.id === "K15" ? 0.6 : 0]));
    const score = scoreK0(fixture, a0Arm, { kind: "vectors", cosine: flat });
    expect(score.held).toContain("K15");
    expect(score.recall.belowPlain.total).toBe(4);
  });
});

describe("N1: the polarity screen on K0, against its predeclared floor", () => {
  const a0 = scoreK0(fixture, a0Arm, { kind: "jaccard" });
  const n1 = scoreK0(fixture, n1Arm, { kind: "jaccard" });

  it("Jaccard-only mode: below-band explicit-negation recall 8/8 (es 4/4), in-band recall unchanged", () => {
    expect([n1.recall.belowNegation.hit, n1.recall.belowNegation.total]).toEqual([8, 8]);
    expect([n1.recall.belowNegationEs.hit, n1.recall.belowNegationEs.total]).toEqual([4, 4]);
    expect(n1.recall.belowNegation.hit / n1.recall.belowNegation.total).toBeGreaterThanOrEqual(0.6);
    expect(n1.recall.belowNegationEs.hit / n1.recall.belowNegationEs.total).toBeGreaterThanOrEqual(0.6);
    expect([n1.recall.inBand.hit, n1.recall.inBand.total]).toEqual([6, 6]);
    expect([n1.recall.belowPlain.hit, n1.recall.belowPlain.total]).toEqual([0, 5]);
    expect([n1.recall.all.hit, n1.recall.es.hit]).toEqual([14, 6]);
  });

  it("Jaccard-only mode: one more false hold than A0 (K35, a same-subject distinct claim with a negator), within A0 + 1", () => {
    expect(n1.falseHold.all.ids.filter((id) => !a0.falseHold.all.ids.includes(id))).toEqual(["K35"]);
    expect(n1.falseHold.all.hit).toBeLessThanOrEqual(a0.falseHold.all.hit + 1);
    expect(a0.held.filter((id) => !n1.held.includes(id))).toEqual([]);
    expect(n1.update.ids).toEqual(a0.update.ids);
  });

  it("vectors-present mode is bounded by text alone: the screen reads no cosine, and every Jaccard-band row is held in both modes", () => {
    const screened = fixture.rows.filter((row) => opposedPolarity(row.established, row.claim, PAIR_JACCARD_FLOOR));
    const negations = fixture.rows.filter((row) => row.label === "contradicts" && row.form === "negation");
    expect(negations.filter((row) => !screened.includes(row)).map((row) => row.id)).toEqual([]);
    const extraFalse = screened.filter((row) => (row.label === "agrees" || row.label === "distinct") && row.band.jaccard === "below");
    expect(extraFalse.map((row) => row.id)).toEqual(["K35"]);
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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildContradictionRequest, CONTRADICTION_RELEASE_FLOORS, releaseDecision, releaseRequest, runContradictionReleaseCalibration, scoreReleaseArm, scoreReleasePhaseA,
  type ContradictionReleaseCase,
} from "./contradiction";
import { buildPairRequest } from "./memory";
import { validateJudgeRequest } from "./questions";
import type { JudgeAnswer, JudgeRequest, JudgeResult } from "./types";

const choiceOf = (value: string, confidence: number): JudgeAnswer => ({ type: "choice", choice: value, confidence, probabilities: { [value]: confidence } });
const result = (answers: Record<string, JudgeAnswer> | null, extra: Partial<JudgeResult> = {}): JudgeResult => ({ answers, model: "jev-1.13.0", latencyMs: 5, stateChars: 0, questionCount: 1, cached: false, ...extra });
const noulOf = (p: number): JudgeAnswer => ({ type: "noul", noul: p });

describe("the two release wordings", () => {
  it("(b) asks one choice question with an explicit contradicts option, and (a) is the pair question unchanged", () => {
    const request = buildContradictionRequest("settled", "claim");
    expect(request.state).toEqual({ settled_note: "settled", new_note: "claim" });
    expect(request.questions.relation.type === "choice" && Object.keys(request.questions.relation.criteria)).toEqual(["agrees", "contradicts", "update", "distinct"]);
    expect(validateJudgeRequest(request)).toEqual([]);
    expect(releaseRequest("a", "settled", "claim")).toEqual(buildPairRequest("settled", "claim"));
    expect(releaseRequest("b", "settled", "claim")).toEqual(request);
  });

  it("(b) releases only a confident agrees", () => {
    expect(releaseDecision("b", result({ relation: choiceOf("agrees", 0.9) }))).toBe(true);
    expect(releaseDecision("b", result({ relation: choiceOf("agrees", 0.59) }))).toBe(false);
    for (const relation of ["contradicts", "update", "distinct"]) expect(releaseDecision("b", result({ relation: choiceOf(relation, 0.99) }))).toBe(false);
  });

  it("(a) maps the pair question: duplicate, distinct and unrelated release; update and an undecided pair hold", () => {
    const pair = (relation: string, confidence: number, sameThing = 0.9) => result({ relation: choiceOf(relation, confidence), same_thing: noulOf(sameThing) });
    expect(releaseDecision("a", pair("duplicate", 0.9))).toBe(true);
    expect(releaseDecision("a", pair("distinct", 0.9))).toBe(true);
    expect(releaseDecision("a", pair("unrelated", 0.9))).toBe(true);
    expect(releaseDecision("a", pair("update", 0.9))).toBe(false);
    expect(releaseDecision("a", pair("duplicate", 0.5))).toBe(false);
  });

  it.each(["timeout", "error", "unavailable", "disabled"] as const)("holds on a %s fallback, whatever the answers say", (fallback) => {
    for (const wording of ["a", "b"] as const) expect(releaseDecision(wording, result({ relation: choiceOf(wording === "a" ? "duplicate" : "agrees", 0.99), same_thing: noulOf(0.9) }, { fallback }))).toBe(false);
    expect(releaseDecision("b", result(null))).toBe(false);
  });
});

describe("Phase A scoring (the live run is pending; this pins the instrument)", () => {
  const holdout = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge/contradiction-release-holdout.json"), "utf8")) as { floors: Record<string, number>; rows: ContradictionReleaseCase[] };

  it("declares the hold-out before any answer: >= 12 rows, >= 4 es, and the plan's floors", () => {
    expect(holdout.rows.length).toBeGreaterThanOrEqual(12);
    expect(holdout.rows.filter((row) => row.lang === "es").length).toBeGreaterThanOrEqual(4);
    expect(holdout.floors).toEqual({ ...CONTRADICTION_RELEASE_FLOORS });
  });

  const plant = (released: (request: JudgeRequest) => boolean) => async (request: JudgeRequest): Promise<JudgeResult> => {
    const wordingB = "settled_note" in (request.state as Record<string, unknown>);
    const release = released(request);
    return result(wordingB
      ? { relation: choiceOf(release ? "agrees" : "contradicts", 0.9) }
      : { relation: choiceOf(release ? "duplicate" : "update", 0.9), same_thing: noulOf(0.9) });
  };
  const claimOf = (request: JudgeRequest) => String((request.state as Record<string, unknown>).new_note ?? (request.state as Record<string, unknown>).newer_note);
  const ids = new Set(holdout.rows.map((row) => row.id));

  it("a judge that answers every label right passes both wordings", async () => {
    const byClaim = new Map(holdout.rows.map((row) => [row.claim, row.label]));
    const report = await runContradictionReleaseCalibration(plant((request) => ["agrees", "distinct"].includes(byClaim.get(claimOf(request)) ?? "")), holdout.rows);
    expect(report.total).toBe(holdout.rows.length * 2);
    expect(report.right).toBe(report.total);
    for (const wording of ["a", "b"] as const) expect(scoreReleaseArm(report, holdout.rows, wording, ids).ok).toBe(true);
  });

  it("one released contradiction fails the arm (releaseErr floor 0.05 over 5 rows), and a Spanish one fails it on its own", async () => {
    const releasing = (id: string) => plant((request) => holdout.rows.some((row) => row.id === id && row.claim === claimOf(request)) || holdout.rows.some((row) => row.label === "agrees" && row.claim === claimOf(request)));
    const en = scoreReleaseArm(await runContradictionReleaseCalibration(releasing("R01"), holdout.rows), holdout.rows, "b", ids);
    expect([en.releaseErr.hit, en.ok]).toEqual([1, false]);
    const es = scoreReleaseArm(await runContradictionReleaseCalibration(releasing("R04"), holdout.rows), holdout.rows, "b", ids);
    expect([es.releaseErrEs.hit, es.ok]).toEqual([1, false]);
  });

  it("a released Spanish contradiction fails the arm even when the overall rate is within 0.05", () => {
    const cases: ContradictionReleaseCase[] = [
      ...Array.from({ length: 21 }, (_, index) => ({ id: `C${index}`, lang: index === 0 ? "es" : "en", label: "contradicts" as const, established: "e", claim: `c${index}` })),
      { id: "A0", lang: "en", label: "agrees", established: "e", claim: "a" },
    ];
    const rows = cases.map((row) => ({ id: `${row.id}.b`, right: true, picked: row.id === "C0" || row.id === "A0" ? "release" : "hold", latencyMs: 0 }));
    const score = scoreReleaseArm({ rows }, cases, "b", new Set(cases.map((row) => row.id)));
    expect(score.releaseErr.hit / score.releaseErr.total).toBeLessThanOrEqual(CONTRADICTION_RELEASE_FLOORS.releaseErr);
    expect([score.releaseErrEs.hit, score.ok]).toEqual([1, false]);
  });

  it("the judge-off column releases nothing, so it equals today's holds and fails the paraphrase floor", async () => {
    const off = await runContradictionReleaseCalibration(async () => result(null, { fallback: "disabled" }), holdout.rows);
    const score = scoreReleaseArm(off, holdout.rows, "b", ids);
    expect(off.rows.every((row) => row.picked === "hold")).toBe(true);
    expect([score.releaseErr.hit, score.paraphraseRelease.hit, score.ok]).toEqual([0, 0, false]);
  });

  it("scores only the declared in-band rows", async () => {
    const report = await runContradictionReleaseCalibration(plant(() => true), holdout.rows);
    const score = scoreReleaseArm(report, holdout.rows, "b", new Set(["R06", "R07"]));
    expect([score.releaseErr.total, score.paraphraseRelease.total, score.ok]).toEqual([0, 2, false]);
  });
});

describe("the Phase A verdict over every band mode", () => {
  const cases: ContradictionReleaseCase[] = [
    { id: "C1", lang: "en", label: "contradicts", established: "e", claim: "c1" },
    { id: "C2", lang: "es", label: "contradicts", established: "e", claim: "c2" },
    { id: "A1", lang: "en", label: "agrees", established: "e", claim: "a1" },
    { id: "A2", lang: "en", label: "agrees", established: "e", claim: "a2" },
  ];
  const report = (releasedA: string[], releasedB: string[]) => ({
    rows: cases.flatMap((row) => [
      { id: `${row.id}.a`, right: true, picked: releasedA.includes(row.id) ? "release" : "hold", latencyMs: 0 },
      { id: `${row.id}.b`, right: true, picked: releasedB.includes(row.id) ? "release" : "hold", latencyMs: 0 },
    ]),
  });

  it("passes a wording only when its arm clears the floors in every mode", () => {
    const verdict = scoreReleasePhaseA(report(["A1", "A2"], ["A1", "A2", "C1"]), cases, { jaccard: ["C1", "A1", "A2"], vectors: ["C1", "C2", "A1", "A2"] });
    expect(verdict.modes.map((mode) => [mode.mode, mode.measured, mode.arms.map((arm) => arm.ok)])).toEqual([["jaccard", true, [true, false]], ["vectors", true, [true, false]]]);
    expect([verdict.passing, verdict.ok]).toEqual([["a"], true]);
  });

  it("a wording that fails one mode is not passing, whatever the other mode says", () => {
    const verdict = scoreReleasePhaseA(report(["A1", "A2", "C2"], []), cases, { jaccard: ["C1", "A1", "A2"], vectors: ["C1", "C2", "A1", "A2"] });
    expect(verdict.modes.map((mode) => mode.arms[0].ok)).toEqual([true, false]);
    expect([verdict.passing, verdict.ok]).toEqual([[], false]);
  });

  it("an unmeasured mode (no cosine bracket file) keeps the verdict open, never passes it", () => {
    const verdict = scoreReleasePhaseA(report(["A1", "A2"], ["A1", "A2"]), cases, { jaccard: ["C1", "A1", "A2"], vectors: null });
    expect(verdict.modes.find((mode) => mode.mode === "vectors")).toEqual({ mode: "vectors", measured: false, arms: [] });
    expect([verdict.passing, verdict.ok]).toEqual([[], false]);
  });

  it("no mode at all is not a pass", () => {
    expect(scoreReleasePhaseA(report(["A1", "A2"], []), cases, {}).ok).toBe(false);
  });
});

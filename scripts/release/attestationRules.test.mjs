import { strict as assert } from "node:assert";
import { test } from "node:test";
import { citedPathProblem, journeyVerdicts, resolveCited, runLines, runProblems, seriesVerdict, statusProblems } from "./attestationRules.mjs";

const SCORES = "test/journeys/records/v2.4-acceptance/human/scores.json";
const BUILD = "a".repeat(64);
const OTHER = "b".repeat(64);
const FIXTURE = "f".repeat(64);

const record = (over = {}) => ({
  id: "J1",
  ranAt: "2026-09-25T10:00:00.000Z",
  strict: true,
  partial: false,
  only: null,
  runnerError: null,
  humanRecord: SCORES,
  results: [
    { id: "J1.1", mode: "auto", outcome: "pass" },
    { id: "J1.2", mode: "auto", outcome: "pass" },
    { id: "J1.8", mode: "human", outcome: "skipped" },
  ],
  cleanup: { extraction: { ok: true } },
  ...over,
  tallies: {
    automated: { pass: 2, fail: 0, blocked: 0, notRunnable: 0, skipped: 0 },
    human: { scored: 1, unscored: 0 },
    cleanup: { ok: true, failed: [], leaked: [] },
    firstAttempt: { pass: 2, retried: 0, retriedIds: [] },
    ...(over.tallies ?? {}),
  },
});

const withResult = (outcome, key) => record({ results: [...record().results, { id: "J1.3", mode: "auto", outcome }], tallies: { automated: { pass: 2, fail: 0, blocked: 0, notRunnable: 0, skipped: 0, [key]: 1 } } });

const run = (green, over = {}) => ({ problems: green ? [] : ["1 failed"], build: BUILD, fixture: FIXTURE, ranAt: null, ...over });

test("a strict, clean, full run with every check passing is green (the positive control)", () => {
  assert.deepEqual(runProblems(record()), []);
  assert.deepEqual(runProblems(record(), { accepted: true, humanScores: SCORES }), []);
});

test("--strict: a failed, blocked, not-runnable or skipped check makes the run not green", () => {
  assert.deepEqual(runProblems(withResult("fail", "fail")), ["1 failed"]);
  assert.deepEqual(runProblems(withResult("blocked", "blocked")), ["1 blocked"]);
  assert.deepEqual(runProblems(withResult("not-runnable", "notRunnable")), ["1 not-runnable"]);
  assert.deepEqual(runProblems(withResult("skipped", "skipped")), ["1 skipped"]);
});

test("a run without --strict is not green even when every check passed", () => {
  assert.deepEqual(runProblems(record({ strict: false })), ["not run with --strict"]);
});

test("a failed cleanup fails the run, with or without --strict", () => {
  const failed = { tallies: { cleanup: { ok: false, failed: ["mirrorBooks.failed: 1 item(s)"], leaked: [] } } };
  assert.deepEqual(runProblems(record(failed)), ["cleanup failed — mirrorBooks.failed: 1 item(s)"]);
  assert.deepEqual(runProblems(record({ ...failed, strict: false })), ["not run with --strict", "cleanup failed — mirrorBooks.failed: 1 item(s)"]);
  assert.deepEqual(runProblems(record({ tallies: { cleanup: { ok: false, failed: [], leaked: ["assets.leaked: SO-J9 card"] } } })), ["cleanup leaked — assets.leaked: SO-J9 card"]);
  assert.deepEqual(runProblems(record({ cleanup: { error: "page closed" } })), ["cleanup threw — page closed"]);
});

test("a partial (--only) run never counts, whichever field says so", () => {
  assert.deepEqual(runProblems(record({ partial: true, only: ["J1.2"] })), ["partial run (--only J1.2): never counts toward ×2"]);
  assert.deepEqual(runProblems(record({ only: ["J1.2"] })), ["partial run (--only J1.2): never counts toward ×2"]);
});

test("a runner error, a hand-edited tally, a count the record never carried and an empty run are each not green", () => {
  assert.deepEqual(runProblems(record({ runnerError: "sandbox escaped" })), ["runner error: sandbox escaped"]);
  assert.deepEqual(runProblems(record({ results: [...record().results, { id: "J1.3", mode: "auto", outcome: "fail" }] })), ["tallies.automated counts 0 non-passing check(s), results hold 1"]);
  assert.deepEqual(runProblems(record({ tallies: { automated: { pass: 2, fail: 0, blocked: 0 } } })), ["no not-runnable count: the record cannot show it had none", "no skipped count: the record cannot show it had none"]);
  assert.deepEqual(runProblems(record({ results: [{ id: "J1.8", mode: "human", outcome: "skipped" }], tallies: { automated: { pass: 0, fail: 0, blocked: 0, notRunnable: 0, skipped: 0 } } })), ["no automated check passed: an empty run proves nothing"]);
  assert.deepEqual(runProblems({ id: "J1" }), ["not a journey run record (no id, results or tallies)"]);
});

test("ACCEPTED needs every human row scored, against the one human-score file", () => {
  const unscored = record({ tallies: { human: { scored: 0, unscored: 2 } } });
  assert.deepEqual(runProblems(unscored), []);
  assert.deepEqual(runProblems(unscored, { accepted: true, humanScores: SCORES }), ["2 human row(s) unscored"]);
  assert.deepEqual(runProblems(record({ humanRecord: null }), { accepted: true, humanScores: SCORES }), ["run without --require-human-record, so its human rows were never checked"]);
  assert.deepEqual(runProblems(record({ humanRecord: "J/human-scores.json" }), { accepted: true, humanScores: SCORES }), [`human rows scored against J/human-scores.json, not ${SCORES}`]);
  assert.deepEqual(runProblems(record({ humanRecord: `C:\\dev\\so\\${SCORES.replace(/\//g, "\\")}` }), { accepted: true, humanScores: SCORES }), []);
});

test("×2 is two CONSECUTIVE green runs: pass-fail-pass is not twice, fail-pass-pass is", () => {
  const pfp = seriesVerdict([run(true), run(false), run(true)]);
  assert.equal(pfp.twice, false);
  assert.equal(pfp.green, 2);
  const fpp = seriesVerdict([run(false), run(true), run(true)]);
  assert.equal(fpp.twice, true);
  assert.deepEqual(fpp.pair, [1, 2]);
  const ppf = seriesVerdict([run(true), run(true), run(false)]);
  assert.deepEqual([ppf.twice, ppf.green, ppf.total], [true, 2, 3]);
  assert.equal(seriesVerdict([run(true)]).twice, false);
  assert.equal(seriesVerdict([]).twice, false);
});

test("×2 needs an unchanged, known build and fixture, on the attested build when one is given", () => {
  assert.equal(seriesVerdict([run(true), run(true, { build: OTHER })]).twice, false);
  assert.equal(seriesVerdict([run(true), run(true, { fixture: OTHER })]).twice, false);
  const unknown = seriesVerdict([run(true, { fixture: null }), run(true, { fixture: null })]);
  assert.equal(unknown.twice, false);
  assert.deepEqual(unknown.problems, ["two adjacent green runs exist, but not on a known, unchanged build and fixture"]);
  assert.equal(seriesVerdict([run(true), run(true)], { attestedBuild: OTHER }).twice, false);
  assert.equal(seriesVerdict([run(true), run(true)], { attestedBuild: BUILD }).twice, true);
});

test("a list whose order is not the order the runs ran cannot show two consecutive runs", () => {
  const reordered = seriesVerdict([run(true, { ranAt: "2026-09-25T10:00:00Z" }), run(true, { ranAt: "2026-09-25T12:00:00Z" }), run(false, { ranAt: "2026-09-25T11:00:00Z" })]);
  assert.equal(reordered.twice, false);
  assert.deepEqual(reordered.problems, ["runs are not listed in the order they ran, so consecutive cannot be read from the list"]);
});

test("a cited path that escapes the records root is refused, and one inside it resolves under it", () => {
  for (const cited of ["../v2.3-plan05-live/j1-run1.json", "J1/../../elsewhere/record.json", "..", "/etc/record.json", "C:\\dev\\record.json", "C:/dev/record.json", "", "  ", null]) {
    assert.ok(citedPathProblem(cited), `${String(cited)} was accepted`);
  }
  assert.equal(citedPathProblem("J1/run1/record.json"), null);
  assert.equal(citedPathProblem("J1\\run1\\record.json"), null);
  assert.equal(citedPathProblem("J1/./x/../run1/record.json"), null);
  assert.equal(resolveCited("C:\\repo\\records", "J1/run1/record.json"), "C:/repo/records/J1/run1/record.json");
  assert.throws(() => resolveCited("C:\\repo\\records", "J1/../../x.json"), /escapes the records root/);
});

const files = (entries) => (cited) => entries[cited] ?? null;
const header = (sha) => ({ bundle: { served: { sha256: sha } } });
const attestation = (status, runs, notGreen = []) => ({ status, notGreen, journeys: { J1: { runs } } });
const twoGreen = {
  "J1/run1/record.json": record({ ranAt: "2026-09-25T10:00:00Z" }),
  "J1/run1/header-start.json": header(BUILD),
  "J1/run2/record.json": record({ ranAt: "2026-09-25T11:00:00Z" }),
  "J1/run2/header-start.json": header(BUILD),
};
const cite = (n) => ({ record: `J1/run${n}/record.json`, fixture: FIXTURE });
const check = (doc, entries) => {
  const verdicts = journeyVerdicts(doc, files(entries), { attestedBuild: BUILD, humanScores: SCORES });
  return { verdicts, problems: statusProblems(doc, verdicts, { attestedBuild: BUILD }) };
};

test("an ACCEPTED attestation over two consecutive green records passes, and reports every run", () => {
  const doc = attestation("ACCEPTED", [cite(1), cite(2)]);
  const { verdicts, problems } = check(doc, twoGreen);
  assert.deepEqual(problems, []);
  assert.deepEqual(runLines(doc, verdicts), ["J1 run 1: green", "J1 run 2: green", "J1: 2/2 green, ×2 (runs 1–2)"]);
});

test("ACCEPTED is refused when a human row is unscored, and PARTIAL must name it instead", () => {
  const entries = { ...twoGreen, "J1/run2/record.json": record({ ranAt: "2026-09-25T11:00:00Z", tallies: { human: { scored: 0, unscored: 1 } } }) };
  const accepted = check(attestation("ACCEPTED", [cite(1), cite(2)]), entries).problems;
  assert.ok(accepted.some((line) => line.includes("J1 run(s) 2 not green")), accepted.join("\n"));
  assert.deepEqual(check(attestation("PARTIAL", [cite(1), cite(2)], ["J1: human rows unscored"]), entries).problems, []);
});

test("a failing run is allowed only in a PARTIAL attestation whose notGreen names the journey", () => {
  const entries = { ...twoGreen, "J1/run3/record.json": record({ ranAt: "2026-09-25T12:00:00Z", strict: false }), "J1/run3/header-start.json": header(BUILD) };
  const runs = [cite(1), cite(2), cite(3)];
  assert.ok(check(attestation("ACCEPTED", runs), entries).problems.some((line) => line.startsWith("ACCEPTED, but J1 run(s) 3 not green")));
  assert.ok(check(attestation("ACCEPTED", runs, ["J1 run 3 was not --strict"]), entries).problems.some((line) => line.startsWith("ACCEPTED, but J1 run(s) 3 not green")), "naming a failing run does not make an ACCEPTED attestation true");
  assert.ok(check(attestation("PARTIAL", runs, ["J7 never green"]), entries).problems.some((line) => line.endsWith("notGreen does not name J1")));
  assert.deepEqual(check(attestation("PARTIAL", runs, ["J1 run 3 was not --strict"]), entries).problems, []);
});

test("a run that cites no record, escapes the root, is missing, is another journey's or served another bundle is not evidence", () => {
  const cases = [
    [[{ automated: { pass: 8, fail: 0, blocked: 0 } }, cite(2)], twoGreen, "cites no record"],
    [[{ record: "../elsewhere/J1/run1/record.json", fixture: FIXTURE }, cite(2)], twoGreen, "escapes the records root"],
    [[cite(1), cite(9)], twoGreen, "record J1/run9/record.json is not on disk"],
    [[cite(1), cite(2)], { ...twoGreen, "J1/run2/record.json": record({ id: "J3", ranAt: "2026-09-25T11:00:00Z" }) }, "is J3, not J1"],
    [[cite(1), cite(2)], { ...twoGreen, "J1/run2/header-start.json": header(OTHER) }, "did not serve the attested bundle"],
  ];
  for (const [runs, entries, needle] of cases) {
    const { verdicts, problems } = check(attestation("ACCEPTED", runs), entries);
    assert.equal(verdicts.J1.twice, false, needle);
    assert.ok(problems.some((line) => line.includes(needle)) || verdicts.J1.runs.some((row) => row.problems.some((line) => line.includes(needle))), `${needle}: ${problems.join(" | ")}`);
  }
});

test("a retried run must be named: a pass that needed a retry is weaker than a first-try pass", () => {
  const entries = { ...twoGreen, "J1/run2/record.json": record({ ranAt: "2026-09-25T11:00:00Z", tallies: { firstAttempt: { pass: 1, retried: 1, retriedIds: ["J1.2"] } } }) };
  assert.ok(check(attestation("ACCEPTED", [cite(1), cite(2)]), entries).problems.some((line) => line.includes("needed a retry")));
  assert.deepEqual(check(attestation("PARTIAL", [cite(1), cite(2)], ["J1.2 needed a retry in run 2"]), entries).problems, []);
});

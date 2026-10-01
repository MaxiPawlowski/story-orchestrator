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
  engineHistory: { file: "engine-history-J1.json", chats: 1 },
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
  assert.deepEqual(runProblems(unscored), ["2 human row(s) unscored against the record it was run with"]);
  assert.deepEqual(runProblems(record({ humanRecord: null, tallies: { human: { scored: 0, unscored: 2 } } })), []);
  assert.deepEqual(runProblems(unscored, { accepted: true, humanScores: SCORES }), ["2 human row(s) unscored"]);
  assert.deepEqual(runProblems(record({ humanRecord: null }), { accepted: true, humanScores: SCORES }), ["run without --require-human-record, so its human rows were never checked"]);
  assert.deepEqual(runProblems(record({ humanRecord: "J/human-scores.json" }), { accepted: true, humanScores: SCORES }), [`human rows scored against J/human-scores.json, not ${SCORES}`]);
  assert.deepEqual(runProblems(record({ humanRecord: `C:\\dev\\so\\${SCORES.replace(/\//g, "\\")}` }), { accepted: true, humanScores: SCORES }), []);
});

test("H-g: pass-fail-pass-pass with no named change is NOT ×2 and is reported flaky 3/4", () => {
  const verdict = seriesVerdict([run(true), run(false), run(true), run(true)]);
  assert.equal(verdict.twice, false);
  assert.equal(verdict.pair, null);
  assert.deepEqual(verdict.series.map((entry) => entry.label), ["flaky 3/4"]);
  assert.ok(verdict.problems.some((line) => line.includes("flaky 3/4")), verdict.problems.join(" | "));
  assert.equal(seriesVerdict([run(false), run(true), run(true)]).twice, false, "fail-pass-pass with no change is luck, not ×2");
  assert.equal(seriesVerdict([run(true), run(false), run(true)]).twice, false);
});

test("H-g: fail, named change, pass, pass is ×2 on the new series", () => {
  const verdict = seriesVerdict([run(false), run(true, { change: "fixture: J3.7 window widened (register F12)" }), run(true)]);
  assert.equal(verdict.twice, true);
  assert.deepEqual(verdict.pair, [1, 2]);
  assert.deepEqual(verdict.series.map((entry) => [entry.runs, entry.label]), [[[1], "red"], [[2, 3], "×2"]]);
  assert.deepEqual(verdict.problems, []);
  assert.equal(seriesVerdict([run(false), run(true, { change: "   " }), run(true)]).twice, false, "a blank change is not a named change");
});

test("H-g: green ×2 is the FIRST two runs of the series; pass-pass-fail stays ×2 and the failure is reported", () => {
  const verdict = seriesVerdict([run(true), run(true), run(false)]);
  assert.deepEqual([verdict.twice, verdict.green, verdict.total, verdict.pair], [true, 2, 3, [0, 1]]);
  assert.equal(seriesVerdict([run(true), run(true), run(false), run(true)]).twice, false, "a later fail-then-pass makes the series flaky");
  assert.equal(seriesVerdict([run(true)]).twice, false);
  assert.equal(seriesVerdict([]).twice, false);
});

test("H-g: a pair across two builds or fixtures is not ×2, named change or not", () => {
  const acrossBuilds = seriesVerdict([run(true), run(true, { build: OTHER })]);
  assert.equal(acrossBuilds.twice, false);
  assert.ok(acrossBuilds.problems.some((line) => line.includes("more than one build or fixture")), acrossBuilds.problems.join(" | "));
  assert.equal(seriesVerdict([run(true), run(true, { fixture: OTHER })]).twice, false);
  assert.equal(seriesVerdict([run(true), run(true, { build: OTHER, change: "product: re-freeze" })]).twice, false, "one run on the new build is not a pair");
  assert.equal(seriesVerdict([run(true), run(true, { build: OTHER, change: "product: re-freeze" }), run(true, { build: OTHER })]).twice, true);
  const unknown = seriesVerdict([run(true, { fixture: null }), run(true, { fixture: null })]);
  assert.equal(unknown.twice, false);
  assert.ok(unknown.problems.some((line) => line.includes("unknown build or fixture")), unknown.problems.join(" | "));
});

test("H-g: the decisive series is the latest on the attested build", () => {
  assert.equal(seriesVerdict([run(true), run(true)], { attestedBuild: OTHER }).twice, false);
  assert.equal(seriesVerdict([run(true), run(true)], { attestedBuild: BUILD }).twice, true);
  const refrozen = [run(true), run(true), run(false, { build: OTHER, change: "product: fix A35" })];
  assert.equal(seriesVerdict(refrozen, { attestedBuild: BUILD }).twice, true);
  assert.equal(seriesVerdict(refrozen, { attestedBuild: OTHER }).twice, false);
  assert.equal(seriesVerdict(refrozen).twice, false, "without an attested build the latest series decides");
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
  "J1/run1/engine-history-J1.json": { chats: [] },
  "J1/run2/engine-history-J1.json": { chats: [] },
};
const runAt = (n, over = {}) => ({
  [`J1/run${n}/record.json`]: record({ ranAt: `2026-09-25T1${n}:00:00Z`, ...over }),
  [`J1/run${n}/header-start.json`]: header(BUILD),
  [`J1/run${n}/engine-history-J1.json`]: { chats: [] },
});
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
  const entries = { ...twoGreen, ...runAt(3, { strict: false }) };
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

const series = (...rows) => Object.assign({}, ...rows.map(([n, over]) => runAt(n, over)));

test("H-g over cited records: pass-fail-pass-pass with no named change is refused as ACCEPTED and must be named in PARTIAL", () => {
  const entries = series([1], [2, { strict: false }], [3], [4]);
  const runs = [cite(1), cite(2), cite(3), cite(4)];
  const accepted = check(attestation("ACCEPTED", runs), entries);
  assert.equal(accepted.verdicts.J1.twice, false);
  assert.ok(accepted.problems.some((line) => line.includes("J1 is not green twice")), accepted.problems.join("\n"));
  assert.ok(accepted.problems.some((line) => line.includes("flaky 3/4")), accepted.problems.join("\n"));
  assert.ok(check(attestation("PARTIAL", runs, ["J7 red"]), entries).problems.some((line) => line.endsWith("notGreen does not name J1")));
  assert.match(runLines(attestation("PARTIAL", runs), accepted.verdicts).at(-1), /NOT ×2 \[series: runs 1,2,3,4 flaky 3\/4\]/);
});

test("H-g over cited records: fail, named change, pass, pass is ACCEPTED; the failure before the change is history", () => {
  const entries = series([1, { strict: false }], [2], [3]);
  const runs = [cite(1), { ...cite(2), change: "harness: settle the save before the switch (register H3)" }, cite(3)];
  const { verdicts, problems } = check(attestation("ACCEPTED", runs), entries);
  assert.equal(verdicts.J1.twice, true);
  assert.deepEqual(problems, []);
  const unnamed = check(attestation("ACCEPTED", [cite(1), cite(2), cite(3)]), entries);
  assert.equal(unnamed.verdicts.J1.twice, false, "the same three runs without the named change are flaky");
});

test("H-g over cited records: a partial run, a failed cleanup or an unscored human row breaks the pair it sits in", () => {
  const cases = [
    [{ partial: true, only: ["J1.2"] }, "partial run"],
    [{ tallies: { cleanup: { ok: false, failed: ["chat.error: page closed"], leaked: [] } } }, "cleanup failed"],
    [{ tallies: { human: { scored: 0, unscored: 1 } } }, "human row(s) unscored"],
  ];
  for (const [over, needle] of cases) {
    for (const status of ["ACCEPTED", "PARTIAL"]) {
      const { verdicts } = check(attestation(status, [cite(1), cite(2)]), series([1], [2, over]));
      assert.equal(verdicts.J1.twice, false, `${status}: ${needle}`);
      assert.ok(verdicts.J1.runs[1].problems.some((line) => line.includes(needle)), `${status}: ${verdicts.J1.runs[1].problems.join(" | ")}`);
    }
  }
});

test("H-k: a record that names an engine-history dump missing from disk is not green, and ACCEPTED needs one", () => {
  const missing = { ...twoGreen };
  delete missing["J1/run2/engine-history-J1.json"];
  const { verdicts } = check(attestation("PARTIAL", [cite(1), cite(2)]), missing);
  assert.equal(verdicts.J1.twice, false);
  assert.ok(verdicts.J1.runs[1].problems.includes("engine history J1/run2/engine-history-J1.json is not on disk"), verdicts.J1.runs[1].problems.join(" | "));
  const unnamed = { ...twoGreen, "J1/run2/record.json": record({ ranAt: "2026-09-25T11:00:00Z", engineHistory: undefined }) };
  assert.equal(check(attestation("PARTIAL", [cite(1), cite(2)]), unnamed).verdicts.J1.twice, true, "an older record without a dump is not refused outside ACCEPTED");
  assert.ok(check(attestation("ACCEPTED", [cite(1), cite(2)]), unnamed).verdicts.J1.runs[1].problems.some((line) => line.includes("names no engine-history dump")));
  const failedDump = { ...twoGreen, "J1/run2/record.json": record({ ranAt: "2026-09-25T11:00:00Z", engineHistory: { error: "the sandbox chat carries no story state" } }) };
  assert.ok(check(attestation("PARTIAL", [cite(1), cite(2)]), failedDump).verdicts.J1.runs[1].problems.some((line) => line.startsWith("engine history was not dumped")));
  const cited = check(attestation("PARTIAL", [cite(1), { ...cite(2), engineHistory: "J1/run2/elsewhere.json" }]), twoGreen);
  assert.ok(cited.verdicts.J1.runs[1].problems.includes("engine history J1/run2/elsewhere.json is not on disk"));
  const escaping = check(attestation("PARTIAL", [cite(1), { ...cite(2), engineHistory: "../x/engine-history-J1.json" }]), twoGreen);
  assert.ok(escaping.verdicts.J1.runs[1].problems.some((line) => line.includes("escapes the records root")));
  const notADump = { ...twoGreen, "J1/run2/engine-history-J1.json": { stories: {} } };
  assert.ok(check(attestation("PARTIAL", [cite(1), cite(2)]), notADump).verdicts.J1.runs[1].problems.some((line) => line.includes("is not an engine-history dump")));
});

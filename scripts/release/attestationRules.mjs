// v2.4 plan 09 §Matrix, as predicates over what a journey run record carries (so-journey.mts
// `runJourney`: strict, partial, only, runnerError, tallies.{automated,human,cleanup,firstAttempt},
// humanRecord, results, ranAt). "×2" is v2.5 plan 10's definition: a series is the runs between two
// named changes (a run citing `change` opens one), and green ×2 is the FIRST TWO runs of the latest
// series on the attested build passing, on one known build and fixture; a series that failed and later
// passed with no named change is flaky and red. Green is --strict, a clean cleanup, never --only.
//
// An attestation run cites its evidence instead of restating it:
//   { record: "J1/run2/record.json", header?: "J1/run2/header-start.json", fixture?: "<sha256 of the journey file>" }
// `header` defaults to header-start.json beside the record; `fixture` falls back to record.fileSha256.

import { posix } from "node:path";

const AUTOMATED = [
  ["fail", "failed"],
  ["blocked", "blocked"],
  ["notRunnable", "not-runnable"],
  ["skipped", "skipped"],
];

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null);

const normalizeCited = (cited) => String(cited).replace(/\\/g, "/");

export function citedPathProblem(cited) {
  if (typeof cited !== "string" || !cited.trim()) return "a citation must be a non-empty path relative to the records root";
  const path = normalizeCited(cited);
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return `${cited} is absolute; citations are relative to the records root`;
  const normalized = posix.normalize(path);
  if (normalized === ".." || normalized.startsWith("../")) return `${cited} escapes the records root`;
  return null;
}

export function resolveCited(recordsRoot, cited) {
  const problem = citedPathProblem(cited);
  if (problem) throw new Error(problem);
  return posix.join(normalizeCited(recordsRoot), posix.normalize(normalizeCited(cited)));
}

export const headerBeside = (record) => posix.join(posix.dirname(normalizeCited(record)), "header-start.json");

const sameFile = (left, right) => typeof left === "string" && typeof right === "string" && posix.normalize(normalizeCited(left)).endsWith(posix.normalize(normalizeCited(right)));

export function runProblems(record, { accepted = false, humanScores = null } = {}) {
  if (!isRecord(record) || typeof record.id !== "string" || !Array.isArray(record.results) || !isRecord(record.tallies)) {
    return ["not a journey run record (no id, results or tallies)"];
  }
  const problems = [];
  if (record.partial === true || (Array.isArray(record.only) && record.only.length)) {
    problems.push(`partial run (--only ${Array.isArray(record.only) ? record.only.join(", ") : "a subset"}): never counts toward ×2`);
  }
  if (record.strict !== true) problems.push("not run with --strict");
  if (record.runnerError) problems.push(`runner error: ${String(record.runnerError).slice(0, 200)}`);

  const automated = isRecord(record.tallies.automated) ? record.tallies.automated : {};
  for (const [key, label] of AUTOMATED) {
    const n = count(automated[key]);
    if (n === null) problems.push(`no ${label} count: the record cannot show it had none`);
    else if (n > 0) problems.push(`${n} ${label}`);
  }
  const unproven = record.results.filter((row) => isRecord(row) && row.mode !== "human" && row.outcome !== "pass").length;
  const tallied = AUTOMATED.reduce((sum, [key]) => sum + (count(automated[key]) ?? 0), 0);
  if (unproven !== tallied) problems.push(`tallies.automated counts ${tallied} non-passing check(s), results hold ${unproven}`);
  if (!record.results.some((row) => isRecord(row) && row.mode !== "human" && row.outcome === "pass")) problems.push("no automated check passed: an empty run proves nothing");

  const cleanup = isRecord(record.tallies.cleanup) ? record.tallies.cleanup : null;
  if (!cleanup) problems.push("no cleanup gate in the record");
  else {
    for (const failure of Array.isArray(cleanup.failed) ? cleanup.failed : []) problems.push(`cleanup failed — ${failure}`);
    for (const leak of Array.isArray(cleanup.leaked) ? cleanup.leaked : []) problems.push(`cleanup leaked — ${leak}`);
    if (cleanup.ok !== true && !(cleanup.failed?.length || cleanup.leaked?.length)) problems.push("cleanup not ok");
  }
  if (isRecord(record.cleanup) && record.cleanup.error) problems.push(`cleanup threw — ${String(record.cleanup.error).slice(0, 200)}`);

  const declaredUnscored = count(record.tallies.human?.unscored);
  if (!accepted && record.humanRecord && declaredUnscored !== null && declaredUnscored > 0) problems.push(`${declaredUnscored} human row(s) unscored against the record it was run with`);

  if (accepted) {
    const human = isRecord(record.tallies.human) ? record.tallies.human : {};
    if (!record.humanRecord) problems.push("run without --require-human-record, so its human rows were never checked");
    else if (humanScores && !sameFile(record.humanRecord, humanScores)) problems.push(`human rows scored against ${record.humanRecord}, not ${humanScores}`);
    const unscored = count(human.unscored);
    if (unscored === null) problems.push("no human unscored count");
    else if (unscored > 0) problems.push(`${unscored} human row(s) unscored`);
  }
  return problems;
}

export const retriedCount = (record) => count(record?.tallies?.firstAttempt?.retried) ?? 0;

export const namedChange = (run) => (isRecord(run) && typeof run.change === "string" && run.change.trim() ? run.change.trim() : null);

export function seriesOf(runs) {
  const series = [];
  runs.forEach((run, index) => {
    if (!series.length || namedChange(run)) series.push({ change: namedChange(run), indexes: [] });
    series[series.length - 1].indexes.push(index);
  });
  return series;
}

const span = (indexes) => (indexes.length > 1 ? `runs ${indexes[0] + 1}–${indexes[indexes.length - 1] + 1}` : `run ${indexes[0] + 1}`);

function judgeSeries(entry, runs, green, attestedBuild) {
  const members = entry.indexes.map((index) => runs[index]);
  const first = members[0];
  const known = members.every((run) => run.build && run.fixture);
  const unchanged = known && members.every((run) => run.build === first.build && run.fixture === first.fixture);
  const greens = entry.indexes.filter((index) => green[index]).length;
  const failedThenPassed = entry.indexes.some((index, at) => !green[index] && entry.indexes.slice(at + 1).some((later) => green[later]));
  const firstTwo = entry.indexes.length >= 2 && green[entry.indexes[0]] && green[entry.indexes[1]];
  const onAttested = !attestedBuild || first.build === attestedBuild;
  const problems = [];
  if (!known) problems.push(`series ${span(entry.indexes)} has a run on an unknown build or fixture`);
  else if (!unchanged) problems.push(`series ${span(entry.indexes)} spans more than one build or fixture with no named change between them`);
  if (failedThenPassed) problems.push(`series ${span(entry.indexes)} is flaky ${greens}/${entry.indexes.length}: it failed and later passed with no named change`);
  const twice = firstTwo && unchanged && !failedThenPassed && onAttested;
  const label = twice ? "×2" : failedThenPassed ? `flaky ${greens}/${entry.indexes.length}` : entry.indexes.length < 2 && green[entry.indexes[0]] ? "open" : "red";
  return { runs: entry.indexes.map((index) => index + 1), change: entry.change, build: first.build ?? null, onAttested, twice, label, problems };
}

export function seriesVerdict(runs, { attestedBuild = null } = {}) {
  const problems = [];
  const times = runs.map((run) => Date.parse(run.ranAt ?? ""));
  if (times.every(Number.isFinite) && times.some((time, index) => index > 0 && time < times[index - 1])) {
    problems.push("runs are not listed in the order they ran, so consecutive cannot be read from the list");
  }
  const green = runs.map((run) => Array.isArray(run.problems) && run.problems.length === 0);
  const series = seriesOf(runs).map((entry) => judgeSeries(entry, runs, green, attestedBuild));
  const decisive = [...series].reverse().find((entry) => entry.onAttested) ?? null;
  const twice = !problems.length && Boolean(decisive?.twice);
  if (decisive) problems.push(...decisive.problems);
  if (!twice && decisive && !decisive.problems.length && decisive.label !== "×2") {
    problems.push(`the last series (${span(decisive.runs.map((run) => run - 1))}${decisive.change ? `, after "${decisive.change}"` : ""}) does not open with two green runs`);
  }
  if (!decisive && runs.length) problems.push("no series ran on the attested build");
  const history = series.filter((entry) => entry !== decisive).flatMap((entry) => entry.problems);
  const pair = twice ? [decisive.runs[0] - 1, decisive.runs[1] - 1] : null;
  const decisiveRuns = decisive ? decisive.runs.map((run) => run - 1) : runs.map((_, index) => index);
  return { twice, pair, green: green.filter(Boolean).length, total: runs.length, series, decisiveRuns, history, problems };
}

export const engineHistoryBeside = (recordPath, file) => posix.join(posix.dirname(normalizeCited(recordPath)), posix.basename(normalizeCited(file)));

export function engineHistoryCitation(run, record) {
  if (isRecord(run) && typeof run.engineHistory === "string") return run.engineHistory;
  const file = isRecord(record?.engineHistory) ? record.engineHistory.file : null;
  return typeof file === "string" && file.trim() && isRecord(run) && typeof run.record === "string" ? engineHistoryBeside(run.record, file) : null;
}

export function engineHistoryProblems(run, record, load, { accepted = false } = {}) {
  const problems = [];
  const named = isRecord(record?.engineHistory) ? record.engineHistory : null;
  if (named?.error) problems.push(`engine history was not dumped: ${String(named.error).slice(0, 200)}`);
  const cited = engineHistoryCitation(run, record);
  if (!cited) {
    if (accepted) problems.push("the record names no engine-history dump, so the run cannot be replayed");
    return problems;
  }
  const pathProblem = citedPathProblem(cited);
  if (pathProblem) return [...problems, pathProblem];
  const dump = load(cited);
  if (!dump) problems.push(`engine history ${cited} is not on disk`);
  else if (!isRecord(dump) || !Array.isArray(dump.chats)) problems.push(`engine history ${cited} is not an engine-history dump (no chats)`);
  return problems;
}

export function journeyVerdicts(attestation, load,{ attestedBuild = null, humanScores = null } = {}) {
  const accepted = attestation?.status === "ACCEPTED";
  return Object.fromEntries(
    Object.entries(attestation?.journeys ?? {})
      .filter(([id, journey]) => /^J\d+$/.test(id) && typeof journey.notRun !== "string")
      .map(([id, journey]) => {
        const runs = (journey.runs ?? []).map((run) => {
          const change = namedChange(run);
          const bare = (problems) => ({ problems, build: null, fixture: null, ranAt: null, retried: 0, change });
          if (!isRecord(run) || typeof run.record !== "string") return bare(["cites no record: a run summary typed into the attestation is not evidence"]);
          const pathProblem = citedPathProblem(run.record) ?? (run.header === undefined ? null : citedPathProblem(run.header)) ?? (run.engineHistory === undefined ? null : citedPathProblem(run.engineHistory));
          if (pathProblem) return bare([pathProblem]);
          const record = load(run.record);
          if (!record) return bare([`record ${run.record} is not on disk`]);
          const header = load(run.header ?? headerBeside(run.record));
          const problems = runProblems(record, { accepted, humanScores });
          if (record.id !== id) problems.push(`record ${run.record} is ${record.id}, not ${id}`);
          problems.push(...engineHistoryProblems(run, record, load, { accepted }));
          return {
            problems,
            build: header?.bundle?.served?.sha256 ?? null,
            fixture: run.fixture ?? record.fileSha256 ?? null,
            ranAt: record.ranAt ?? null,
            retried: retriedCount(record),
            change,
          };
        });
        return [id, { runs, ...seriesVerdict(runs, { attestedBuild }) }];
      }),
  );
}

const names = (lines, id) => (lines ?? []).some((line) => new RegExp(`\\b${id}\\b`).test(line));

export function statusProblems(attestation, verdicts, { attestedBuild = null } = {}) {
  const problems = [];
  const accepted = attestation?.status === "ACCEPTED";
  for (const [id, verdict] of Object.entries(verdicts)) {
    const named = names(attestation.notGreen, id);
    const current = new Set(verdict.decisiveRuns ?? verdict.runs.map((_, index) => index));
    const pick = (test) => verdict.runs.map((run, index) => (current.has(index) && test(run) ? index + 1 : null)).filter(Boolean);
    const failing = pick((run) => run.problems.length > 0);
    const offBuild = attestedBuild ? pick((run) => run.build !== attestedBuild) : [];
    const retried = pick((run) => run.retried > 0);
    const issues = [
      ...(verdict.twice ? [] : [`${id} is not green twice (${verdict.green}/${verdict.total} green)`]),
      ...(failing.length ? [`${id} run(s) ${failing.join(", ")} not green`] : []),
      ...(offBuild.length ? [`${id} run(s) ${offBuild.join(", ")} did not serve the attested bundle`] : []),
      ...(retried.length ? [`${id} run(s) ${retried.join(", ")} needed a retry`] : []),
      ...verdict.problems.map((line) => `${id}: ${line}`),
    ];
    if (!issues.length) continue;
    if (accepted) problems.push(...issues.map((line) => `ACCEPTED, but ${line}`));
    else if (!named) problems.push(...issues.map((line) => `${line}, and notGreen does not name ${id}`));
  }
  return problems;
}

export const greenTwiceEverywhere = (verdicts) => Object.values(verdicts).every((verdict) => verdict.twice);

export function runLines(attestation, verdicts) {
  return Object.keys(attestation?.journeys ?? {})
    .filter((id) => /^J\d+$/.test(id))
    .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)))
    .flatMap((id) => {
      const journey = attestation.journeys[id];
      if (typeof journey.notRun === "string") return [`${id}: not run — ${journey.notRun}`];
      const verdict = verdicts[id];
      const series = (verdict.series ?? []).length > 1 || (verdict.series ?? []).some((entry) => entry.label.startsWith("flaky"))
        ? ` [series: ${verdict.series.map((entry) => `runs ${entry.runs.join(",")} ${entry.label}`).join("; ")}]`
        : "";
      return [
        ...verdict.runs.map((run, index) => `${id} run ${index + 1}: ${run.change ? `(new series after: ${run.change}) ` : ""}${run.problems.length ? `NOT green — ${run.problems.join("; ")}` : "green"}${run.retried ? `, retried ${run.retried}` : ""}`),
        `${id}: ${verdict.green}/${verdict.total} green, ${verdict.twice ? `×2 (runs ${verdict.pair[0] + 1}–${verdict.pair[1] + 1})` : "NOT ×2"}${series}`,
      ];
    });
}

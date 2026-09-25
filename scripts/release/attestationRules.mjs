// v2.4 plan 09 §Matrix, as predicates over what a journey run record carries (so-journey.mts
// `runJourney`: strict, partial, only, runnerError, tallies.{automated,human,cleanup,firstAttempt},
// humanRecord, results, ranAt). "×2" is two CONSECUTIVE green runs on an unchanged build and fixture;
// green is --strict (blocked, not-runnable and skipped fail), a clean cleanup with or without --strict,
// never a partial (--only) run. The old test counted ANY two runs with fail === blocked === 0.
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

export function seriesVerdict(runs, { attestedBuild = null } = {}) {
  const problems = [];
  const times = runs.map((run) => Date.parse(run.ranAt ?? ""));
  if (times.every(Number.isFinite) && times.some((time, index) => index > 0 && time < times[index - 1])) {
    problems.push("runs are not listed in the order they ran, so consecutive cannot be read from the list");
  }
  const green = runs.map((run) => Array.isArray(run.problems) && run.problems.length === 0);
  let pair = null;
  for (let index = 1; index < runs.length && !pair && !problems.length; index += 1) {
    const [left, right] = [runs[index - 1], runs[index]];
    if (!green[index - 1] || !green[index]) continue;
    if (!left.build || left.build !== right.build) continue;
    if (!left.fixture || left.fixture !== right.fixture) continue;
    if (attestedBuild && left.build !== attestedBuild) continue;
    pair = [index - 1, index];
  }
  if (!pair && !problems.length && green.some((value, index) => value && green[index + 1])) {
    problems.push("two adjacent green runs exist, but not on a known, unchanged build and fixture");
  }
  return { twice: Boolean(pair), pair, green: green.filter(Boolean).length, total: runs.length, problems };
}

export function journeyVerdicts(attestation, load, { attestedBuild = null, humanScores = null } = {}) {
  const accepted = attestation?.status === "ACCEPTED";
  return Object.fromEntries(
    Object.entries(attestation?.journeys ?? {})
      .filter(([id, journey]) => /^J\d+$/.test(id) && typeof journey.notRun !== "string")
      .map(([id, journey]) => {
        const runs = (journey.runs ?? []).map((run) => {
          if (!isRecord(run) || typeof run.record !== "string") return { problems: ["cites no record: a run summary typed into the attestation is not evidence"], build: null, fixture: null, ranAt: null, retried: 0 };
          const pathProblem = citedPathProblem(run.record) ?? (run.header === undefined ? null : citedPathProblem(run.header));
          if (pathProblem) return { problems: [pathProblem], build: null, fixture: null, ranAt: null, retried: 0 };
          const record = load(run.record);
          if (!record) return { problems: [`record ${run.record} is not on disk`], build: null, fixture: null, ranAt: null, retried: 0 };
          const header = load(run.header ?? headerBeside(run.record));
          const problems = runProblems(record, { accepted, humanScores });
          if (record.id !== id) problems.push(`record ${run.record} is ${record.id}, not ${id}`);
          return {
            problems,
            build: header?.bundle?.served?.sha256 ?? null,
            fixture: run.fixture ?? record.fileSha256 ?? null,
            ranAt: record.ranAt ?? null,
            retried: retriedCount(record),
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
    const failing = verdict.runs.map((run, index) => (run.problems.length ? index + 1 : null)).filter(Boolean);
    const offBuild = attestedBuild ? verdict.runs.map((run, index) => (run.build !== attestedBuild ? index + 1 : null)).filter(Boolean) : [];
    const retried = verdict.runs.map((run, index) => (run.retried > 0 ? index + 1 : null)).filter(Boolean);
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
      return [
        ...verdict.runs.map((run, index) => `${id} run ${index + 1}: ${run.problems.length ? `NOT green — ${run.problems.join("; ")}` : "green"}${run.retried ? `, retried ${run.retried}` : ""}`),
        `${id}: ${verdict.green}/${verdict.total} green, ${verdict.twice ? `×2 (runs ${verdict.pair[0] + 1}–${verdict.pair[1] + 1})` : "NOT ×2"}`,
      ];
    });
}

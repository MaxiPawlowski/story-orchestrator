// v2.3 plan 01 §D — three gates, counted separately.
//
// T3/T4/T6 from the credibility audit: one flat tally by outcome hid three different kinds of
// "not proven". A human check reported `skipped`, which reads like "deliberately not run" and is
// indistinguishable from `--only` skipping it; a missing capability reported `blocked`, which
// `--strict` catches but a baseline run does not; and cleanup failures and leaked assets were in
// the record but in nothing that decided the exit code. A gate is green only when all three are.

export type Outcome = 'pass' | 'fail' | 'blocked' | 'not-runnable' | 'skipped';

export interface CheckResult {
  id: string;
  mode?: string;
  outcome: Outcome;
  detail?: string;
  firstAttempt?: 'pass' | 'fail';
}

export interface Tallies {
  automated: { pass: number; fail: number; blocked: number; notRunnable: number; skipped: number };
  human: { scored: number; unscored: number };
  cleanup: { ok: boolean; failed: string[]; leaked: string[] };
  /** S5/F1: of the checks that passed, how many needed no retry. "Passed eventually" is a weaker
   * claim than "passed first time", and only the second says a repair worked. */
  firstAttempt: { pass: number; retried: number; retriedIds: string[] };
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Walk a cleanup report for the two things that make a run not-clean: a step that errored, and
 * anything it admits it left behind. Both are nested at varying depths across asset, mirror-book,
 * story and config reports, so the walk is structural rather than a list of known paths — a new
 * cleanup step that reports `{error}` or `{leaked: [...]}` is covered the day it is added.
 */
export function readCleanup(report: unknown): Tallies['cleanup'] {
  const failed: string[] = [];
  const leaked: string[] = [];

  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const at = path ? `${path}.${key}` : key;
      if (key === 'error' && child) failed.push(`${at}: ${String(child)}`);
      else if (key === 'failed' && Array.isArray(child) && child.length) failed.push(`${at}: ${child.length} item(s)`);
      else if ((key === 'leaked' || key === 'leakedAssets') && Array.isArray(child) && child.length) leaked.push(`${at}: ${child.join(', ')}`);
      else if (key === 'clean' && child === false) failed.push(`${at}: cleanup reported clean:false`);
      else walk(child, at);
    }
  };

  walk(report, '');
  return { ok: failed.length === 0 && leaked.length === 0, failed, leaked };
}

/**
 * A human check is `scored` only when a record names it. Without `--require-human-record` the
 * count still shows on screen, so an acceptance run cannot be read as complete while rubric rows
 * sit unscored.
 */
export function computeTallies(results: CheckResult[], cleanupReport: unknown, scoredHumanIds: string[] = []): Tallies {
  const scored = new Set(scoredHumanIds);
  const automated = { pass: 0, fail: 0, blocked: 0, notRunnable: 0, skipped: 0 };
  const human = { scored: 0, unscored: 0 };

  for (const row of results) {
    if (row.mode === 'human') {
      if (scored.has(row.id)) human.scored += 1;
      else human.unscored += 1;
      continue;
    }
    if (row.outcome === 'pass') automated.pass += 1;
    else if (row.outcome === 'fail') automated.fail += 1;
    else if (row.outcome === 'blocked') automated.blocked += 1;
    else if (row.outcome === 'not-runnable') automated.notRunnable += 1;
    else automated.skipped += 1;
  }

  const passed = results.filter((row) => row.mode !== 'human' && row.outcome === 'pass');
  const retriedIds = passed.filter((row) => row.firstAttempt === 'fail').map((row) => row.id);
  return {
    automated,
    human,
    cleanup: readCleanup(cleanupReport),
    firstAttempt: { pass: passed.length - retriedIds.length, retried: retriedIds.length, retriedIds },
  };
}

export interface GateOptions {
  strict: boolean;
  /** Set when --require-human-record was passed: unscored human rows then fail the run. */
  requireHumanRecord?: boolean;
  runnerError?: unknown;
}

/** Why this run is not green, in the order a reader should see. Empty means it is. */
export function gateFailures(tallies: Tallies, { strict, requireHumanRecord = false, runnerError = null }: GateOptions): string[] {
  const reasons: string[] = [];
  if (runnerError) reasons.push(`runner error: ${String(runnerError)}`);
  if (tallies.automated.fail > 0) reasons.push(`${tallies.automated.fail} automated check(s) failed`);
  if (strict && tallies.automated.blocked > 0) reasons.push(`${tallies.automated.blocked} blocked (strict)`);
  if (strict && tallies.automated.notRunnable > 0) reasons.push(`${tallies.automated.notRunnable} not-runnable (strict)`);
  if (strict && tallies.automated.skipped > 0) reasons.push(`${tallies.automated.skipped} skipped (strict): an acceptance run runs every check`);
  // Cleanup failing is a failing run whether or not --strict was passed: a leak is a leak, and the
  // next run (or a real player) inherits it.
  for (const failure of tallies.cleanup.failed) reasons.push(`cleanup failed — ${failure}`);
  for (const leak of tallies.cleanup.leaked) reasons.push(`cleanup leaked — ${leak}`);
  if (requireHumanRecord && tallies.human.unscored > 0) reasons.push(`${tallies.human.unscored} human check(s) unscored`);
  return reasons;
}

/** One line per gate, for the console and the record header. */
export function renderTallies(tallies: Tallies): string {
  const { automated: a, human: h, cleanup: c } = tallies;
  return [
    `automated: ${a.pass} pass, ${a.fail} fail, ${a.blocked} blocked, ${a.notRunnable} not-runnable, ${a.skipped} skipped`,
    `human:     ${h.scored} scored, ${h.unscored} unscored`,
    `cleanup:   ${c.ok ? 'clean' : `${c.failed.length} failure(s), ${c.leaked.length} leak(s)`}`,
    `first try: ${tallies.firstAttempt.pass} of ${tallies.firstAttempt.pass + tallies.firstAttempt.retried} passing check(s) needed no retry${tallies.firstAttempt.retried ? ` (retried: ${tallies.firstAttempt.retriedIds.join(', ')})` : ''}`,
  ].join('\n');
}

/** Human check ids a scoring record marks as scored. The file is a human artefact, so be lenient. */
export function readScoredHumanIds(doc: unknown): string[] {
  if (Array.isArray(doc)) {
    return doc.flatMap((row) => (typeof row === 'string' ? [row] : isRecord(row) && typeof row.id === 'string' && row.score !== undefined && row.score !== null ? [row.id] : []));
  }
  if (isRecord(doc)) {
    if (Array.isArray(doc.scores)) return readScoredHumanIds(doc.scores);
    return Object.entries(doc).flatMap(([id, value]) => (value === undefined || value === null || value === '' ? [] : [id]));
  }
  return [];
}

export interface CheckSummary { id: string; mode?: string; expect?: Outcome }

/**
 * A check may declare the outcome the RUNNER must produce for it (`"expect": "blocked"`). That is
 * how J0 gates the runner itself: a capability-guarded check must report `blocked` and an
 * unguarded throw must report `fail`, and J0 is green only when the classifier agrees. Without it,
 * "J0 passes" meant only that its checks happened to pass, which says nothing about the runner.
 */
export function reconcileExpected(summary: CheckSummary, outcome: Outcome, detail = ''): CheckResult & { observed?: Outcome } {
  const wanted = summary.expect;
  if (!wanted) return { ...summary, outcome, detail };
  const agreed = outcome === wanted;
  return {
    ...summary,
    outcome: agreed ? 'pass' : 'fail',
    observed: outcome,
    detail: agreed
      ? `reported ${outcome} as expected${detail ? ` — ${detail}` : ''}`
      : `expected this check to report ${wanted}, got ${outcome}${detail ? ` — ${detail}` : ''}`,
  };
}

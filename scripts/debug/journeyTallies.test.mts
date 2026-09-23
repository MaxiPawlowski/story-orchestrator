// v2.3 plan 01 §D. The three gates decide whether an acceptance run is green, so each way a run
// can be not-green is asserted here rather than read off a matrix by eye.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTallies, gateFailures, readCleanup, readScoredHumanIds, reconcileExpected, renderTallies } from './lib/journeyTallies.mts';

const auto = (id: string, outcome: string) => ({ id, mode: 'auto', outcome } as never);
const humanRow = (id: string) => ({ id, mode: 'human', outcome: 'skipped' } as never);
const clean = { chat: { deleted: 1 }, assets: { removed: [], clean: true } };

test('automated, human and cleanup are counted separately', () => {
  const tallies = computeTallies([auto('a', 'pass'), auto('b', 'fail'), auto('c', 'blocked'), humanRow('h1')], clean);
  assert.deepEqual(tallies.automated, { pass: 1, fail: 1, blocked: 1, notRunnable: 0, skipped: 0 });
  assert.deepEqual(tallies.human, { scored: 0, unscored: 1 });
  assert.equal(tallies.cleanup.ok, true);
});

test('a human check never lands in the automated tally', () => {
  // It used to report `skipped`, which was indistinguishable from a check --only left out.
  const tallies = computeTallies([humanRow('h1'), humanRow('h2')], clean);
  assert.equal(tallies.automated.skipped, 0);
  assert.equal(tallies.human.unscored, 2);
});

test('a scoring record moves a human row from unscored to scored', () => {
  const tallies = computeTallies([humanRow('J8.4'), humanRow('J9.6')], clean, ['J8.4']);
  assert.deepEqual(tallies.human, { scored: 1, unscored: 1 });
});

test('a failing automated check fails the run with or without --strict', () => {
  const tallies = computeTallies([auto('a', 'fail')], clean);
  assert.match(gateFailures(tallies, { strict: false })[0], /1 automated check\(s\) failed/);
  assert.equal(gateFailures(tallies, { strict: true }).length, 1);
});

test('blocked, not-runnable and skipped fail only under --strict', () => {
  const tallies = computeTallies([auto('a', 'blocked'), auto('b', 'not-runnable'), auto('c', 'skipped')], clean);
  assert.deepEqual(gateFailures(tallies, { strict: false }), []);
  const strict = gateFailures(tallies, { strict: true });
  assert.equal(strict.length, 3);
  assert.ok(strict.some((reason) => /blocked/.test(reason)));
  assert.ok(strict.some((reason) => /not-runnable/.test(reason)));
  assert.ok(strict.some((reason) => /skipped/.test(reason)));
});

test('a cleanup failure fails the run even without --strict', () => {
  // A leak is a leak: the next run, or a real player, inherits it.
  const tallies = computeTallies([auto('a', 'pass')], { assets: { error: 'could not reach the host' } });
  const reasons = gateFailures(tallies, { strict: false });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /cleanup failed — assets\.error: could not reach the host/);
});

test('a leaked asset fails the run and is named', () => {
  const tallies = computeTallies([auto('a', 'pass')], { assets: { leaked: ['SO-J9 card', 'SO-J9 book'] } });
  assert.match(gateFailures(tallies, { strict: false })[0], /cleanup leaked — assets\.leaked: SO-J9 card, SO-J9 book/);
});

test('cleanup problems are found wherever they are nested', () => {
  const report = { chat: { deleted: 1 }, mirrorBooks: { deleted: 2, failed: ['book-a'], leaked: [] }, config: { error: 'restore refused' } };
  const cleanup = readCleanup(report);
  assert.equal(cleanup.ok, false);
  assert.equal(cleanup.failed.length, 2);
  assert.ok(cleanup.failed.some((entry) => entry.includes('mirrorBooks.failed')));
  assert.ok(cleanup.failed.some((entry) => entry.includes('config.error')));
});

test('a cleanup step reporting clean:false is a failure', () => {
  assert.equal(readCleanup({ assets: { clean: false } }).ok, false);
});

test('an empty or absent cleanup report is not a failure', () => {
  assert.equal(readCleanup(null).ok, true);
  assert.equal(readCleanup({}).ok, true);
});

test('unscored human rows fail only when a human record was required', () => {
  const tallies = computeTallies([auto('a', 'pass'), humanRow('h1')], clean);
  assert.deepEqual(gateFailures(tallies, { strict: true }), []);
  assert.match(gateFailures(tallies, { strict: true, requireHumanRecord: true })[0], /1 human check\(s\) unscored/);
});

test('a runner error is reported first', () => {
  const tallies = computeTallies([auto('a', 'fail')], clean);
  const reasons = gateFailures(tallies, { strict: true, runnerError: 'page closed' });
  assert.match(reasons[0], /runner error: page closed/);
});

test('a scoring record is read from a list, a list of objects, or a map', () => {
  assert.deepEqual(readScoredHumanIds(['J8.4']), ['J8.4']);
  assert.deepEqual(readScoredHumanIds([{ id: 'J8.4', score: 4 }, { id: 'J9.6' }]), ['J8.4']);
  assert.deepEqual(readScoredHumanIds({ scores: [{ id: 'J8.4', score: 1 }] }), ['J8.4']);
  assert.deepEqual(readScoredHumanIds({ 'J8.4': 4, 'J9.6': null, 'J9.7': '' }), ['J8.4']);
});

test('a score of zero counts as scored', () => {
  assert.deepEqual(readScoredHumanIds([{ id: 'J8.4', score: 0 }]), ['J8.4']);
  assert.deepEqual(readScoredHumanIds({ 'J8.4': 0 }), ['J8.4']);
});

test('the rendered summary names all three gates', () => {
  const text = renderTallies(computeTallies([auto('a', 'pass'), humanRow('h')], { assets: { leaked: ['x'] } }));
  assert.match(text, /automated: 1 pass/);
  assert.match(text, /human: +0 scored, 1 unscored/);
  assert.match(text, /cleanup: +0 failure\(s\), 1 leak\(s\)/);
});

// --- J0 gates the runner: a check can declare the outcome the runner must produce for it. ---

test('a check with no declared expectation is reported as it ran', () => {
  const row = reconcileExpected({ id: 'J3.1' }, 'fail', 'boom');
  assert.equal(row.outcome, 'fail');
  assert.equal(row.detail, 'boom');
  assert.equal(row.observed, undefined);
});

test('a guarded check that reports blocked as expected becomes a pass', () => {
  const row = reconcileExpected({ id: 'J0.3', expect: 'blocked' }, 'blocked', 'missing capability: feature-from-the-future');
  assert.equal(row.outcome, 'pass');
  assert.equal(row.observed, 'blocked');
  assert.match(row.detail, /reported blocked as expected/);
});

test('an unguarded throw that reports fail as expected becomes a pass', () => {
  const row = reconcileExpected({ id: 'J0.5', expect: 'fail' }, 'fail', 'J0.5 fails on purpose');
  assert.equal(row.outcome, 'pass');
  assert.equal(row.observed, 'fail');
});

test('a check that reports the WRONG outcome fails, naming both', () => {
  // The case that matters: a capability guard that stopped working would let J0.3 run its steps
  // and report fail. Before this, J0 simply reported a failing check and nobody could tell whether
  // the runner or the product was wrong.
  const row = reconcileExpected({ id: 'J0.3', expect: 'blocked' }, 'fail', 'these steps must never run');
  assert.equal(row.outcome, 'fail');
  assert.equal(row.observed, 'fail');
  assert.match(row.detail, /expected this check to report blocked, got fail/);
});

test('a check expected to fail that unexpectedly passes is a failure', () => {
  const row = reconcileExpected({ id: 'J0.5', expect: 'fail' }, 'pass');
  assert.equal(row.outcome, 'fail');
  assert.match(row.detail, /expected this check to report fail, got pass/);
});

test('reconciled rows feed the tallies as their reconciled outcome', () => {
  const rows = [
    reconcileExpected({ id: 'J0.3', mode: 'auto', expect: 'blocked' }, 'blocked'),
    reconcileExpected({ id: 'J0.5', mode: 'auto', expect: 'fail' }, 'fail'),
  ];
  const tallies = computeTallies(rows as never, {});
  assert.deepEqual(tallies.automated, { pass: 2, fail: 0, blocked: 0, notRunnable: 0, skipped: 0 });
  assert.deepEqual(gateFailures(tallies, { strict: true }), [], 'J0 is green when the runner classifies correctly');
});

// --- S5/F1: "passed eventually" and "passed first time" are different claims. ---

test('a check that passed without retrying is counted apart from one that needed retries', () => {
  const rows = [
    { id: 'J9.1', mode: 'auto', outcome: 'pass', firstAttempt: 'fail' },
    { id: 'J9.2', mode: 'auto', outcome: 'pass', firstAttempt: 'pass' },
    { id: 'J9.3', mode: 'auto', outcome: 'pass' },
  ] as never;
  const tallies = computeTallies(rows, {});
  assert.deepEqual(tallies.firstAttempt, { pass: 2, retried: 1, retriedIds: ['J9.1'] });
});

test('a failing check is not counted in the first-attempt rate at all', () => {
  const rows = [{ id: 'a', mode: 'auto', outcome: 'fail', firstAttempt: 'fail' }] as never;
  assert.deepEqual(computeTallies(rows, {}).firstAttempt, { pass: 0, retried: 0, retriedIds: [] });
});

test('retries do not fail the run on their own — they are reported', () => {
  const tallies = computeTallies([{ id: 'J9.1', mode: 'auto', outcome: 'pass', firstAttempt: 'fail' }] as never, {});
  assert.deepEqual(gateFailures(tallies, { strict: true }), []);
  assert.match(renderTallies(tallies), /first try: 0 of 1 passing check\(s\) needed no retry \(retried: J9\.1\)/);
});

test('a check that failed once BY DESIGN did not need a retry (found by running J0 live)', () => {
  // J0.5 declares `expect: "fail"`: it throws once and never re-samples. Tying first-attempt to
  // "the steps succeeded" reported it as retried, which is the opposite of what happened.
  const row = { ...reconcileExpected({ id: 'J0.5', mode: 'auto', expect: 'fail' }, 'fail'), firstAttempt: 'pass' } as never;
  const tallies = computeTallies([row], {});
  assert.deepEqual(tallies.firstAttempt, { pass: 1, retried: 0, retriedIds: [] });
  assert.match(renderTallies(tallies), /first try: 1 of 1 passing check\(s\) needed no retry/);
});

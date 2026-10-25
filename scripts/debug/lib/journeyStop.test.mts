import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journeyS5, retriesAsPlumbing, stoppedRow } from './journeyStop.mts';

test('only a harness defect is retried, and --no-stop turns the retry off', () => {
  assert.equal(retriesAsPlumbing({ ok: false, error: 'page.evaluate: Target closed' }, false), true);
  assert.equal(retriesAsPlumbing({ ok: false, error: 'page.evaluate: Target closed' }, true), false);
  assert.equal(retriesAsPlumbing({ ok: false, error: 'expect: activeCheckpoint cp1 != cp2' }, false), false);
  assert.equal(retriesAsPlumbing({ ok: true, error: null }, false), false);
});

test('an S5 stop records where it stopped and what ran, and the rest read not-runnable', () => {
  const stop = journeyS5('J3.4', 3, 12, 'connect ECONNREFUSED', [{ outcome: 'pass' }, { outcome: 'pass' }, { outcome: 'fail' }]);
  assert.deepEqual(stop, {
    stopped: 'S5', verdict: 'not-a-measurement', at: '4/12', reason: 'J3.4: harness error after one retry: connect ECONNREFUSED',
    counts: { items: 4, planned: 12, outcomes: { pass: 2, fail: 1 } },
  });
  assert.equal(stoppedRow({ id: 'J3.5' }, stop).outcome, 'not-runnable');
  assert.match(stoppedRow({ id: 'J3.5' }, stop).detail, /stopped S5 at 4\/12/);
});

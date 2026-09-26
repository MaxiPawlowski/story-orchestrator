import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callTimeoutMs, TIMEOUT_RETRY_SCALE } from '../../../src/extraction/callBudget.ts';
import { baseRunFromLog, forcedTimeoutScale, setScaleCommand } from './timeoutArm.mts';

const RUN3 = 'test/journeys/records/v2.4-acceptance/P03/live-v24-03-memorize-run3.log';

test('the archived v2.4 base run yields the whole-chat pass last and a feasible scale', () => {
  const run = baseRunFromLog(readFileSync(RUN3, 'utf-8'));
  assert.equal(run.maxTokens, 512);
  assert.deepEqual(run.passes.map((pass) => pass.n), [3, 9, 10]);
  const verdict = forcedTimeoutScale(run);
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.ok(verdict.lo < verdict.scale && verdict.scale < verdict.hi);
  assert.ok(verdict.full.firstMs < verdict.full.measuredMs, 'the first ask of the whole-chat pass must time out');
  assert.ok(verdict.full.retryMs > verdict.full.measuredMs, 'its 2x retry must answer');
  for (const pass of run.passes) {
    const retry = Math.round(callTimeoutMs(512, Math.ceil(pass.promptChars / 4)) * verdict.scale) * TIMEOUT_RETRY_SCALE;
    assert.ok(retry > pass.ms, `pass ${pass.n} (${pass.ms} ms) must still answer on its retry (${retry} ms)`);
  }
});

test('a scale is refused when the whole-chat pass is the fastest pass by far: its retry-safe floor is above its timeout ceiling', () => {
  const verdict = forcedTimeoutScale({ maxTokens: 512, passes: [{ n: 1, ms: 250000, promptChars: 400000 }, { n: 2, ms: 60000, promptChars: 400000 }] });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? '' : verdict.reason, /no uniform scale/);
});

test('a base run whose whole-chat pass outlived its unscaled budget is refused: the base arm itself times out', () => {
  const budget = callTimeoutMs(512, 100000);
  const verdict = forcedTimeoutScale({ maxTokens: 512, passes: [{ n: 1, ms: budget * 1.5, promptChars: 400000 }] });
  assert.equal(verdict.ok, false);
});

test('control: no answered pass, or no maxTokens, is no scale', () => {
  assert.equal(forcedTimeoutScale({ maxTokens: 512, passes: [] }).ok, false);
  assert.equal(forcedTimeoutScale({ maxTokens: 0, passes: [{ n: 1, ms: 100000, promptChars: 400000 }] }).ok, false);
});

test('a re-asked read and a timed-out first ask are not passes', () => {
  const summary = { estimateVsTrue: [], budget: { maxTokens: 512 }, requests: [
    { n: 1, kind: 'read', outcome: 'aborted', ms: 50000, promptChars: 1000 },
    { n: 2, kind: 'read', outcome: 'ok', ms: 90000, promptChars: 1000 },
    { n: 3, kind: 'read', outcome: 'ok', ms: 1000, promptChars: 500 },
    { n: 4, kind: 'read', outcome: 'ok', ms: 1000, promptChars: 500 },
    { n: 5, kind: 'probe', outcome: 'ok', ms: 300, promptChars: 40 },
  ], reasked: [{ n: 4 }], timeoutRetries: [{ first: { n: 1 } }] };
  const log = `noise\n16/16 eval -> ${JSON.stringify(summary)}\n{"ok": true}`;
  assert.deepEqual(baseRunFromLog(log).passes.map((pass) => pass.n), [2, 3]);
});

test('a truncated summary line is an error that says how to get a whole one', () => {
  assert.throws(() => baseRunFromLog('16/16 eval -> {"estimateVsTrue":[{"reason":"memorize:win'), /raise that step's "log" budget/);
  assert.throws(() => baseRunFromLog('nothing here'), /no base-run summary line/);
});

test('the set command writes the scale key the arm step reads', () => {
  assert.equal(setScaleCommand(0.49), `node scripts/debug/st-eval.mts "localStorage.setItem('so-v25-a11-scale', '0.49')"`);
});

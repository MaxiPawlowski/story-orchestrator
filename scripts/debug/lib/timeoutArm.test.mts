import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callTimeoutMs, TIMEOUT_RETRY_SCALE } from '../../../src/extraction/callBudget.ts';
import { A11_MARGIN, CACHE_REUSE_MAX_DEPTH, DEEP_ABORT_RETRY_COST, baseRunFromLog, forcedTimeoutScale, retryCostMs, setScaleCommand } from './timeoutArm.mts';

const BASE = 'test/journeys/records/v2.5-plan02/A11-exclusive/base.log';
const RUN3 = 'test/journeys/records/v2.4-acceptance/P03/live-v24-03-memorize-run3.log';
const ARCHIVED_SCALE = JSON.parse(readFileSync('test/journeys/records/v2.5-plan02/A11-exclusive/scale.json', 'utf-8')) as { scale: number };
const budget = (promptChars: number) => callTimeoutMs(512, Math.ceil(promptChars / 4));

const assertTargetedPlan = (file: string) => {
  const run = baseRunFromLog(readFileSync(file, 'utf-8'));
  const verdict = forcedTimeoutScale(run, 'targeted');
  assert.equal(verdict.ok, true, 'reason' in verdict ? verdict.reason : '');
  if (!verdict.ok) return;
  const full = run.passes[run.passes.length - 1];
  assert.ok(verdict.lo < verdict.scale && verdict.scale <= verdict.hi);
  assert.ok(verdict.full.firstMs < full.ms * (1 - A11_MARGIN), 'the first ask of the whole-chat pass must time out');
  assert.ok(verdict.full.abortDepth <= CACHE_REUSE_MAX_DEPTH, 'the cut must be shallow enough for the retry to reuse the cache');
  assert.ok(verdict.full.retryMs > verdict.full.retryCostMs * (1 + A11_MARGIN), `its ${TIMEOUT_RETRY_SCALE}x retry (${verdict.full.retryMs} ms) must cover the modelled retry (${verdict.full.retryCostMs} ms)`);
};

test('the archived A11 base run: the whole-scale arm is infeasible, and the reason names both constraints', () => {
  const run = baseRunFromLog(readFileSync(BASE, 'utf-8'));
  assert.equal(run.maxTokens, 512);
  assert.deepEqual(run.passes.map((pass) => pass.n), [3, 4, 5]);
  const verdict = forcedTimeoutScale(run, 'whole');
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /^infeasible: every other pass must answer on its first ask \(needs > 0\.529, pass n=3 at 123488 ms\)/);
  assert.match(verdict.reason, /the whole-chat pass \(n=5, 137795 ms\) must time out/);
  assert.ok((verdict.lo ?? 0) > (verdict.hi ?? 1));
});

test('the archived A11 base run: the targeted arm has a feasible scale that cuts the whole-chat pass shallow', () => {
  assertTargetedPlan(BASE);
  const verdict = forcedTimeoutScale(baseRunFromLog(readFileSync(BASE, 'utf-8')), 'targeted');
  assert.equal(verdict.ok && verdict.scale, 0.248);
});

test('the archived v2.4 base run: same shape, whole infeasible and targeted feasible', () => {
  const run = baseRunFromLog(readFileSync(RUN3, 'utf-8'));
  assert.deepEqual(run.passes.map((pass) => pass.n), [3, 9, 10]);
  assert.equal(forcedTimeoutScale(run, 'whole').ok, false);
  assertTargetedPlan(RUN3);
});

test('(b) the scale the old model chose for the archived run cuts the whole-chat pass deep, and the modelled retry misses its 2x budget, as measured live', () => {
  const run = baseRunFromLog(readFileSync(BASE, 'utf-8'));
  const full = run.passes[run.passes.length - 1];
  const first = Math.round(budget(full.promptChars) * ARCHIVED_SCALE.scale);
  const depth = first / full.ms;
  assert.ok(depth > CACHE_REUSE_MAX_DEPTH);
  assert.ok(retryCostMs(full.ms, depth) > first * TIMEOUT_RETRY_SCALE);
});

test('(b) the retry model: a deep abort costs the measured 1.85x cold, a shallow one re-reads only the rest at the slower rate', () => {
  assert.equal(retryCostMs(100000, 0.9), 100000 * DEEP_ABORT_RETRY_COST);
  assert.equal(Math.round(retryCostMs(100000, 0.4)), 79800);
  assert.ok(retryCostMs(114310, 60018 / 114310) > 55857, 'the shallow model must not undercut the measured 55857 ms retry after a 60 s abort');
});

test('(a) whole mode: the other passes bound the scale by their FIRST ask, not by their retry', () => {
  const fullPass = { n: 2, ms: 137795, promptChars: 401761 };
  const window = { n: 1, ms: 70000, promptChars: 401761 };
  assert.ok((window.ms * (1 + A11_MARGIN)) / (TIMEOUT_RETRY_SCALE * budget(window.promptChars)) < 0.269, 'the retry-based bound the old model used would have admitted this window');
  const verdict = forcedTimeoutScale({ maxTokens: 512, passes: [window, fullPass] }, 'whole');
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? '' : verdict.reason, /pass n=1 at 70000 ms/);
  assert.equal(forcedTimeoutScale({ maxTokens: 512, passes: [window, fullPass] }, 'targeted').ok, true);
});

test('whole mode is feasible when every other pass answers early enough on its first ask', () => {
  const window = { n: 1, ms: 20000, promptChars: 400000 };
  const run = { maxTokens: 512, passes: [window, { n: 2, ms: 137795, promptChars: 401761 }] };
  const verdict = forcedTimeoutScale(run, 'whole');
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.ok(Math.round(budget(window.promptChars) * verdict.scale) > window.ms * (1 + A11_MARGIN), 'the window must answer on its first ask');
});

test('a base run whose whole-chat pass outlived its unscaled budget is refused: the base arm itself times out', () => {
  const verdict = forcedTimeoutScale({ maxTokens: 512, passes: [{ n: 1, ms: budget(400000) * 1.5, promptChars: 400000 }] });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? '' : verdict.reason, /base arm itself times out/);
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

test('the set command writes the keys the arm step reads: the target for the targeted arm, none for the whole arm', () => {
  assert.equal(setScaleCommand(0.248), `node scripts/debug/st-eval.mts "localStorage.setItem('so-v25-a11-scale', '0.248'); localStorage.setItem('so-v25-a11-target', 'memorize:full')"`);
  assert.equal(setScaleCommand(0.49, 'whole'), `node scripts/debug/st-eval.mts "localStorage.setItem('so-v25-a11-scale', '0.49'); localStorage.removeItem('so-v25-a11-target')"`);
});

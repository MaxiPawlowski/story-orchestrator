// V20a: the step engine's own rules, executed. T2 (a verb answering `ok:false` fails its step) lived only
// in `runSteps`, with nothing running it; the runner kept a second modifier list without `expectFail`,
// so a step LEADING with `expectFail` validated and was then dispatched as a verb; and `firstAttempt`
// read `pass` on a run that failed outright. These drive the real `runSteps` with a fake page whose
// `evaluate` runs the closure in-process, so the `eval` verb is the real one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSteps } from './so-scenario.mts';

const page = { evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };
const run = (steps: unknown[]) => runSteps(page as never, steps as never, {} as never);
const quiet = async <T,>(work: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => undefined;
  try { return await work(); } finally { console.log = log; }
};

test('a verb that answers ok:false fails its step and names the verb (T2)', async () => {
  const result = await quiet(() => run([{ eval: 'return { ok: false, error: "import never landed" };' }]));
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /^eval: reported ok:false — "import never landed"/);
});

test('a step declared to fail passes when it fails, and fails when it succeeds', async () => {
  assert.equal((await quiet(() => run([{ eval: 'return { ok: false };', expectFail: true }]))).ok, true);
  const surprise = await quiet(() => run([{ eval: 'return { ok: true };', expectFail: true }]));
  assert.equal(surprise.ok, false);
  assert.match(surprise.error ?? '', /expected this step to fail/);
});

test('expectFail as the FIRST key is a modifier, not a verb', async () => {
  const result = await quiet(() => run([{ expectFail: true, eval: 'return { ok: false };' }]));
  assert.equal(result.ok, true, result.error ?? '');
  assert.equal((result.steps[0] as { key: string }).key, 'eval');
});

test('firstAttempt is fail when the only attempt failed, and when a retry was needed', async () => {
  assert.equal((await quiet(() => run([{ eval: 'return 1;' }]))).firstAttempt, 'pass');
  assert.equal((await quiet(() => run([{ eval: 'throw new Error("no");' }]))).firstAttempt, 'fail');
  (globalThis as { __v20aTries?: number }).__v20aTries = 0;
  const retried = await quiet(() => run([{ eval: 'globalThis.__v20aTries += 1; if (globalThis.__v20aTries < 2) throw new Error("first sample");', attempts: 2 }]));
  assert.equal(retried.ok, true);
  assert.equal(retried.firstAttempt, 'fail');
  assert.equal(retried.retries.length, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalJobsOn, evaluateInST, readEvalJob, startEvalJob } from './evaluate.mts';

const SLOT = '__soEvalJobs';
const fakePage = (overrides: Record<string, unknown> = {}) => {
  const calls: string[] = [];
  const page = {
    mainFrame: () => null,
    evaluate: async (fn: (arg: any) => unknown, arg?: unknown) => { calls.push(fn.name || 'anonymous'); return fn(arg); },
    ...overrides,
  };
  return { page: page as any, calls };
};

test('an async evaluation runs as a page-side job: one start, then polls until it settles', async () => {
  const { page, calls } = fakePage();
  const value = await evaluateInST(page, async (n: number) => { await new Promise((r) => setTimeout(r, 250)); return { doubled: n * 2 }; }, 21);
  assert.deepEqual(value, { doubled: 42 });
  assert.equal(calls[0], 'startEvalJob');
  assert.ok(calls.filter((name) => name === 'readEvalJob').length >= 2, `polled ${calls.length - 1} time(s)`);
  assert.equal((globalThis as any)[SLOT].size, 0, 'a settled job leaves the page');
});

test('a job that throws reads as a script error, not a navigation', async () => {
  const { page } = fakePage();
  await assert.rejects(evaluateInST(page, async () => { throw new Error('Message 1 not found.'); }), /^Error: Evaluation failed in SillyTavern page: page\.evaluate: Error: Message 1 not found\.$/);
});

test('a job the page no longer holds (a reload) reads as a navigation', async () => {
  const { page } = fakePage();
  const pending = evaluateInST(page, async () => { await new Promise((r) => setTimeout(r, 400)); return 1; });
  await new Promise((r) => setTimeout(r, 50));
  (globalThis as any)[SLOT].clear();
  await assert.rejects(pending, /SillyTavern page navigated away during evaluation/);
});

test('a synchronous function and a page without a main frame keep the plain evaluate', async () => {
  const sync = fakePage();
  assert.equal(await evaluateInST(sync.page, (n: number) => n + 1, 1), 2);
  assert.deepEqual(sync.calls, ['anonymous']);
  const bare = fakePage({ mainFrame: undefined });
  assert.equal(await evaluateInST(bare.page, async (n: number) => n + 1, 1), 2);
  assert.deepEqual(bare.calls, ['anonymous']);
});

test('C-H1: SO_EVAL_JOBS=off restores the plain awaited evaluate, for a D-EB3 reproduction run', async () => {
  const previous = process.env.SO_EVAL_JOBS;
  process.env.SO_EVAL_JOBS = 'off';
  try {
    const { page, calls } = fakePage();
    assert.equal(await evaluateInST(page, async (n: number) => n + 1, 1), 2);
    assert.deepEqual(calls, ['anonymous']);
  } finally {
    if (previous === undefined) delete process.env.SO_EVAL_JOBS;
    else process.env.SO_EVAL_JOBS = previous;
  }
  assert.equal(evalJobsOn({}), true);
  assert.equal(evalJobsOn({ SO_EVAL_JOBS: 'off' }), false);
});

test('a source the page cannot parse falls back to the plain evaluate', () => {
  assert.equal(startEvalJob({ source: 'async method() { return 1; }', arg: null, id: 'x', slot: '__soEvalJobsParse' }), false);
  assert.deepEqual(readEvalJob({ id: 'x', slot: '__soEvalJobsParse' }), { state: 'lost' });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPool, checkFrozen, freeze, PRIVATE_DIR, refusePublicPrivate, REPO_ROOT, runE0 } from './lib/e0.mts';
import { main } from './so-e0.mts';

const SYNTHETIC = join(process.cwd(), 'test/fixtures/e0/synthetic');
const LABELS = join(SYNTHETIC, 'labels.json');
const POOL = join(process.cwd(), 'test/measurements/v2.8/21-e0/synthetic.pool.json');
const FREEZE = join(process.cwd(), 'test/measurements/v2.8/21-e0/synthetic.freeze.json');
const GOLDEN = join(process.cwd(), 'test/goldens/e0/synthetic-result.json');

const quiet = async <T,>(run: () => Promise<T>): Promise<T> => {
  const log = console.log;
  const error = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
    console.error = error;
  }
};

test('E0: the synthetic pool rebuilds byte-identical from the labels and the stub provider', async () => {
  const { pool } = await buildPool(LABELS, SYNTHETIC, 'stub');
  assert.deepEqual(pool, JSON.parse(await readFile(POOL, 'utf-8')));
  assert.equal(pool.questions.length, 40);
  assert.equal(pool.questions.filter((question) => !question.candidates.some((candidate) => question.gold.includes(candidate.messageId))).length >= 4, true);
});

test('E0: the committed freeze matches the committed labels and pool', async () => {
  assert.equal(await checkFrozen(FREEZE, LABELS, POOL), null);
  assert.deepEqual(await freeze(LABELS, POOL), JSON.parse(await readFile(FREEZE, 'utf-8')));
});

test('E0: the synthetic run replays to the golden', async () => {
  assert.deepEqual(await runE0(LABELS, POOL), JSON.parse(await readFile(GOLDEN, 'utf-8')));
});

test('E0 refusal: run without a freeze, or with a pool edited after the freeze', async () => {
  const work = await mkdtemp(join(tmpdir(), 'so-e0-test-'));
  const edited = join(work, 'pool.json');
  const pool = JSON.parse(await readFile(POOL, 'utf-8'));
  [pool.questions[0].candidates[0], pool.questions[0].candidates[1]] = [pool.questions[0].candidates[1], pool.questions[0].candidates[0]];
  await writeFile(edited, JSON.stringify(pool));
  assert.match(await checkFrozen(undefined, LABELS, POOL) ?? '', /no freeze record/);
  assert.match(await checkFrozen(FREEZE, LABELS, edited) ?? '', /pool file differs/);
  assert.equal(await quiet(() => main(['run', '--labels', LABELS, '--pool', edited, '--freeze', FREEZE])), 3);
  assert.equal(await quiet(() => main(['run', '--labels', LABELS, '--pool', POOL])), 3);
});

test('E0 refusal: private output inside the public repo, a provider name buildPool does not run', async () => {
  assert.throws(() => refusePublicPrivate('private', join(REPO_ROOT, 'test/measurements/x.json')), /private E0 output/);
  assert.doesNotThrow(() => refusePublicPrivate('private', join(PRIVATE_DIR, 'pool.json')));
  assert.doesNotThrow(() => refusePublicPrivate('private', join(tmpdir(), 'pool.json')));
  assert.doesNotThrow(() => refusePublicPrivate('synthetic', join(REPO_ROOT, 'test/measurements/x.json')));
  await assert.rejects(() => buildPool(LABELS, SYNTHETIC, 'st-vectors' as 'stub'), /unknown here/);
});

test('E0 CLI: recorded Choice calls score arm d and count four calls per question', async () => {
  const work = await mkdtemp(join(tmpdir(), 'so-e0-cli-'));
  const pool = JSON.parse(await readFile(POOL, 'utf-8')) as { questions: Array<{ id: string; gold: number[]; candidates: Array<{ messageId: number }> }> };
  const calls = Object.fromEntries(pool.questions.map((question) => {
    const gold = question.candidates.find((candidate) => question.gold.includes(candidate.messageId))?.messageId ?? null;
    return [question.id, [gold, null, null, null].map((pick) => ({ pick, latencyMs: 250, inputTokens: 1000 }))];
  }));
  await writeFile(join(work, 'calls.json'), JSON.stringify(calls));
  const out = join(work, 'result.json');
  const code = await quiet(() => main(['run', '--labels', LABELS, '--pool', POOL, '--freeze', FREEZE, '--choices', join(work, 'calls.json'), '--out', out]));
  const result = JSON.parse(await readFile(out, 'utf-8'));
  const armD = result.arms.find((arm: { arm: string }) => arm.arm === 'd');
  assert.deepEqual({ calls: armD.metrics.callsPerQuestion, p50: armD.metrics.latencyP50, tokens: armD.metrics.inputTokensPerQuestion }, { calls: 4, p50: 1000, tokens: 4000 });
  assert.equal(armD.metrics.hitAt1, armD.metrics.poolRecall);
  assert.equal(result.verdict.status, 'no-winner');
  assert.equal(code, 0);
});

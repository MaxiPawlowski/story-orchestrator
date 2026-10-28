import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { step, type StepCtx } from './pocSteps.mts';
import { testTempDir } from '../../lib/testTemp.mjs';

test('a journey checkpoints its active step before work and its result after durable evidence', async () => {
  const dir = await testTempDir('so-poc-progress-');
  const progress: unknown[] = [];
  const ctx: StepCtx = { page: {} as Page, dir, current: 'setup', rows: [], refusals: [], only: null };
  ctx.checkpoint = async () => { progress.push({ current: ctx.current, outcomes: ctx.rows.map((row) => row.outcome) }); };
  try {
    await step(ctx, 'rig', 'member', async () => {
      assert.deepEqual(progress, [{ current: 'rig:member', outcomes: [] }]);
      return { data: { saved: true } };
    });
    assert.deepEqual(progress, [{ current: 'rig:member', outcomes: [] }, { current: 'rig:member', outcomes: ['pass'] }]);
    assert.equal(JSON.parse(await readFile(join(dir, 'steps.jsonl'), 'utf8')).outcome, 'pass');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

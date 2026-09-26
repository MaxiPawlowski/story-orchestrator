import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixtureCleanupSteps, removesMarkedAssets } from './scenarioCleanup.mts';
import { validateFixture } from './scenarioSchema.mts';

const forcedPick = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../test/scenarios/live-v24-05-forced-pick.json'), 'utf-8'));

test('A27: the forced-pick fixture removes (and so deselects) its SO-V2405 marker book in cleanup, which runs even when a step fails', () => {
  const cleanup = fixtureCleanupSteps(forcedPick);
  assert.ok(removesMarkedAssets(cleanup, 'SO-V2405'));
  assert.deepEqual(validateFixture(forcedPick, 'forced-pick'), []);
});

test('A27 control: its ordinary steps alone never remove the book', () => {
  assert.equal(removesMarkedAssets(forcedPick.steps, 'SO-V2405'), false);
});

test('a bare step array or a fixture without cleanup has no cleanup steps', () => {
  assert.deepEqual(fixtureCleanupSteps([{ send: 'x' }]), []);
  assert.deepEqual(fixtureCleanupSteps({ steps: [] }), []);
  assert.deepEqual(fixtureCleanupSteps({ steps: [], cleanup: { steps: [{ assets: { action: 'remove', marker: 'M' } }, 'junk'] } }), [{ assets: { action: 'remove', marker: 'M' } }]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batchExitCode, itemArgs } from './st-lanes.mts';

test('a batch with any red run exits non-zero, so `$?` after it is evidence', () => {
  assert.equal(batchExitCode({ green: 8, runs: 10 }), 1);
  assert.equal(batchExitCode({ green: 0, runs: 2 }), 1);
});

test('an all-green batch exits 0; an empty batch is not green', () => {
  assert.equal(batchExitCode({ green: 10, runs: 10 }), 0);
  assert.equal(batchExitCode({ green: 0, runs: 0 }), 1);
});

test('v2.5 plan 01: --wi-gating reaches a journey and never a scenario', () => {
  assert.deepEqual(itemArgs('j7', true, null, 'scan'), ['scripts/debug/so-journey.mts', 'run', 'J7', '--strict', '--wi-gating', 'scan']);
  assert.deepEqual(itemArgs('J3', false, null), ['scripts/debug/so-journey.mts', 'run', 'J3']);
  assert.deepEqual(itemArgs('test/scenarios/x.json', true, 'g1', 'scan'), ['scripts/debug/so-scenario.mts', 'run', 'test/scenarios/x.json', '--sandbox', '--group', 'g1']);
});

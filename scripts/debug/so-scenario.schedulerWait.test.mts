import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedulerWaitMs } from './so-scenario.mts';

test('SO_WAIT_TIMEOUT_FLOOR_MS raises a schedulerIdle wait, never lowers it', () => {
  assert.equal(schedulerWaitMs(300000, {}), 300000);
  assert.equal(schedulerWaitMs(300000, { SO_WAIT_TIMEOUT_FLOOR_MS: '900000' }), 900000);
  assert.equal(schedulerWaitMs(1200000, { SO_WAIT_TIMEOUT_FLOOR_MS: '900000' }), 1200000);
  assert.equal(schedulerWaitMs(300000, { SO_WAIT_TIMEOUT_FLOOR_MS: 'x' }), 300000);
});

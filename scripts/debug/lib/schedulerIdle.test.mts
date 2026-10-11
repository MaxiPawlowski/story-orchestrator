import assert from 'node:assert/strict';
import { test } from 'node:test';
import { schedulerIdle } from './schedulerIdle.mts';

test('parked jobs are idle, runnable and in-flight jobs are not', () => {
  const parked = { inFlight: false, queueDepth: 1, held: 1, heavyInFlight: false, heavyQueueDepth: 2, heavyHeld: 2 };
  assert.equal(schedulerIdle(parked), true);
  assert.equal(schedulerIdle({ ...parked, held: 0 }), false);
  assert.equal(schedulerIdle({ ...parked, heavyHeld: 1 }), false);
  assert.equal(schedulerIdle({ ...parked, inFlight: true }), false);
  assert.equal(schedulerIdle({ ...parked, heavyInFlight: true }), false);
  assert.equal(schedulerIdle(null), false);
  assert.equal(schedulerIdle({ inFlight: false, queueDepth: 0 }), true);
});

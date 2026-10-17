import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLaneNumber, LANE_MAX, laneRangeIssue } from './laneRange.mts';

test('lanes 1..99 are lanes; lane 0, 100 and non-integers are refused with the range named', () => {
  for (const n of [1, 50, 73, 85, 99]) assert.equal(isLaneNumber(n), true, String(n));
  for (const n of [0, 100, -1, 1.5, Number.NaN]) assert.equal(isLaneNumber(n), false, String(n));
  assert.equal(laneRangeIssue('86'), null);
  assert.equal(laneRangeIssue('0'), `lane must be 1..${LANE_MAX} (lane 0 is the user's), got 0`);
});

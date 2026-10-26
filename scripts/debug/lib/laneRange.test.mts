import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLaneNumber, LANE_MAX, LANE_MIN, laneIssue, lanePortIssue, lanePorts, laneRangeIssue, RESERVED_PORTS } from './laneRange.mts';

test('lanes 1..99 are lanes; lane 0, 100 and non-integers are refused with the range named', () => {
  for (const n of [1, 50, 73, 85, 99]) assert.equal(isLaneNumber(n), true, String(n));
  for (const n of [0, 100, -1, 1.5, Number.NaN]) assert.equal(isLaneNumber(n), false, String(n));
  assert.equal(laneRangeIssue('86'), null);
  assert.equal(laneRangeIssue('0'), `lane must be 1..${LANE_MAX} (lane 0 is the user's), got 0`);
});

test('a lane takes ST port 8100+n and CDP port 9300+n', () => {
  assert.deepEqual(lanePorts(46), { st: 8146, cdp: 9346 });
});

test('the reserved list names every service a lane must never take', () => {
  for (const port of [8188, 8000, 18888, 18889, 18078, 18079, 18080, 8095, 8096, 8765, 6006, 9222]) assert.ok(RESERVED_PORTS[port], String(port));
});

test('lane 88 is refused: its ST port 8188 is ComfyUI (2026-10-18)', () => {
  assert.equal(lanePortIssue(88), 'lane 88 refused: its ST port 8188 is reserved for ComfyUI; pick another lane');
  assert.equal(laneIssue('88'), lanePortIssue(88));
});

test('a planted collision refuses the lane on its CDP port, naming the service', () => {
  const planted = { ...RESERVED_PORTS, 9305: 'a planted service', 8107: 'another planted service' };
  assert.equal(lanePortIssue(5, planted), 'lane 5 refused: its CDP port 9305 is reserved for a planted service; pick another lane');
  assert.match(laneIssue(7, planted)!, /ST port 8107 is reserved for another planted service/);
  assert.equal(lanePortIssue(5), null);
});

test('with the default list, lane 88 is the only refused lane in 1..99', () => {
  const refused = Array.from({ length: LANE_MAX - LANE_MIN + 1 }, (_, i) => i + LANE_MIN).filter((n) => laneIssue(n) !== null);
  assert.deepEqual(refused, [88]);
  assert.match(laneIssue(0)!, /lane 0 is the user's/);
});

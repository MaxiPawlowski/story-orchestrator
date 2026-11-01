import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextScriptLine, turnsStop } from './sessionTurns.mts';

test('the line script cycles, so 40 lines can drive a 150-boundary session', () => {
  const lines = ['a', 'b', 'c'];
  assert.deepEqual([0, 1, 2, 3, 4, 7].map((at) => nextScriptLine(lines, at)), ['a', 'b', 'c', 'a', 'b', 'b']);
});

test('turns stop at the boundary goal, not at the end of the file', () => {
  assert.equal(turnsStop({ played: 40, maxTurns: Number.POSITIVE_INFINITY, boundary: 72, untilBoundary: 150 }), null);
  assert.match(String(turnsStop({ played: 90, maxTurns: Number.POSITIVE_INFINITY, boundary: 150, untilBoundary: 150 })), /reached 150/);
  assert.match(String(turnsStop({ played: 120, maxTurns: 120, boundary: 140, untilBoundary: 150 })), /ran out before boundary 150/);
  assert.match(String(turnsStop({ played: 3, maxTurns: 3, boundary: null, untilBoundary: null })), /played 3/);
  assert.equal(turnsStop({ played: 0, maxTurns: 3, boundary: null, untilBoundary: null }), null);
});

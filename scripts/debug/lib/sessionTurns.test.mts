import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextScriptLine, rowBoundary, turnsStop } from './sessionTurns.mts';

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

test('43 H2: a turn row holds boundary {from,to}; --until-boundary reads its to, so the loop stops', () => {
  assert.equal(rowBoundary({ boundary: { from: 149, to: 150 } }, 149), 150);
  assert.equal(rowBoundary({ boundary: 7 }, null), 7);
  assert.equal(rowBoundary({ boundary: { from: 3, to: null } }, 3), 3);
  assert.equal(rowBoundary(null, 5), 5);
  let boundary: number | null = null;
  const rows = [{ boundary: { from: 0, to: 1 } }, { boundary: { from: 1, to: 2 } }, { boundary: { from: 2, to: 3 } }];
  let played = 0;
  for (const row of rows) {
    if (turnsStop({ played, maxTurns: Number.POSITIVE_INFINITY, boundary, untilBoundary: 2 })) break;
    played += 1;
    boundary = rowBoundary(row, boundary);
  }
  assert.equal(played, 2);
  assert.match(String(turnsStop({ played, maxTurns: Number.POSITIVE_INFINITY, boundary, untilBoundary: 2 })), /reached 2/);
});

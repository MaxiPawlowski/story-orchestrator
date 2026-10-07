import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonPack, scoreComparison, scoreLooks, labeledComparison, scoreLabeled } from './spriteComparison.mts';

const samples = ['neutral', 'happy', 'angry', 'worried'].map((label) => ({ label, base: 'data:image/png;base64,YQ==', blink: 'data:image/png;base64,Yg==', talk: 'data:image/png;base64,Yw==', talk2: 'data:image/png;base64,ZA==' }));

test('labeled review presents every expression once with three explicit modes and preserves a pending verdict', () => {
  const pack = labeledComparison(samples, 'pilot');
  assert.equal(pack.samples.length, 4);
  assert.match(pack.id, /^belle-pilot-[a-f0-9]{12}-labeled$/);
  assert.notEqual(pack.id, labeledComparison(samples.map((sample) => ({ ...sample, talk: 'data:image/png;base64,eA==' })), 'pilot').id);
  assert.equal(scoreLabeled(pack.votes).status, 'pending-user-ratings');
  const votes = pack.votes.map((vote) => ({ ...vote, preferred: 'smooth' as const,
    modes: { regular: { seam: false, expression: true }, simple: { seam: false, expression: true }, smooth: { seam: false, expression: true } } }));
  assert.equal(scoreLabeled(votes).status, 'user-reviewed');
  assert.equal(scoreLabeled(votes).preferences.smooth, 4);
  assert.equal(scoreLabeled(votes).acceptance, 'pending-full-S28-matrix-and-runtime-gates');
  assert.throws(() => scoreLabeled(votes.slice(1)), /four/);
  assert.throws(() => scoreLabeled([votes[0], votes[0], votes[2], votes[3]]), /four/);
});

test('every expression gets all three distinct comparisons with reproducible blind ordering', () => {
  const pack = comparisonPack(samples, 'pilot');
  assert.equal(pack.pairs.length, 12);
  assert.deepEqual(pack, comparisonPack(samples, 'pilot'));
  for (const sample of samples) {
    const pairs = pack.pairs.filter((pair) => pair.label === sample.label);
    assert.equal(new Set(pairs.map((pair) => [...pair.variants].sort().join(','))).size, 3);
  }
  assert.equal(pack.status, 'pending-user-ratings');
  assert.throws(() => comparisonPack(samples.slice(1), 'pilot'), /four/);
  assert.throws(() => comparisonPack(samples.map((sample) => ({ ...sample, talk2: '' })), 'pilot'), /three PNG/);
});

test('missing seam or expression verdicts cannot green a preference gate', () => {
  const pack = comparisonPack(samples, 'pilot');
  assert.equal(scoreComparison(pack.key, pack.votes).status, 'pending-user-ratings');
  assert.equal(scoreComparison(pack.key, pack.votes.map((vote) => ({ ...vote, preferred: 'A' }))).status, 'pending-user-ratings');
  assert.throws(() => scoreComparison(pack.key, [...pack.votes, pack.votes[0]]), /Duplicate/);
});

test('ties keep simple and seam failures remain red even when animation wins every preference', () => {
  const pack = comparisonPack(samples, 'pilot');
  const votes = pack.key.map((row) => ({ id: row.id, preferred: row.A === 'regular' ? 'B' as const : row.B === 'regular' ? 'A' as const : 'tie' as const,
    seamA: false, seamB: false, expressionA: true, expressionB: true, note: '' }));
  const result = scoreComparison(pack.key, votes);
  assert.equal(result.visualFloors, true);
  assert.equal(result.mouthChoice, 'simple');
  assert.equal(result.acceptance, 'pending-full-S28-matrix-and-runtime-gates');
  assert.equal(scoreComparison(pack.key, votes.map((vote) => ({ ...vote, seamA: true }))).visualFloors, false);
});

test('look scores keep the twenty-image denominator and independent identity and visible-change floors', () => {
  const rows = Array.from({ length: 20 }, (_, id) => ({ id, sameCharacter: id < 18, changeVisible: true, expressionPreserved: true }));
  assert.equal(scoreLooks(rows).passes, true);
  assert.equal(scoreLooks(rows.map((row) => ({ ...row, changeVisible: row.id < 17 }))).passes, false);
  assert.throws(() => scoreLooks(rows.slice(1)), /twenty/);
  assert.throws(() => scoreLooks(rows.map((row) => ({ ...row, id: 0 }))), /ordered/);
});

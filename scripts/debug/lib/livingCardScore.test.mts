import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCardArm, decideCardOverlay } from './livingCardScore.mts';

const ratings = (agreeing: number, mentioned = 30) => Array.from({ length: 30 }, (_, at) => ({ mentions: at < mentioned, agrees: at < agreeing }));
const report = (round: number) => ({ kind: 's32-1', round, build: 'candidate', cleanup: { clean: true },
  arms: { none: { ratings: ratings(20) }, depth1: { ratings: ratings(29) }, depth4: { ratings: ratings(30) } } });

test('overlay selection requires the agreement floor and a worse baseline in both runs', () => {
  assert.equal(decideCardOverlay([report(1), report(2)]).depth, 4);
  const equal = report(2); equal.arms.none.ratings = ratings(30);
  assert.equal(decideCardOverlay([report(1), equal]).verdict, 'keep-off');
  const below = report(2); below.arms.depth4.ratings = ratings(26); below.arms.depth1.ratings = ratings(26);
  assert.equal(decideCardOverlay([report(1), below]).verdict, 'keep-off');
});

test('unmentioned replies are counted and never shrink the 30-reply denominator silently', () => {
  assert.deepEqual(scoreCardArm(ratings(15, 15)), { replies: 30, mentioned: 15, excluded: 15, agreeing: 15, agreement: 1, floor: true });
  assert.equal(scoreCardArm(ratings(14, 14)).floor, false);
  assert.throws(() => scoreCardArm(ratings(30).slice(1)), /every one/);
  assert.throws(() => decideCardOverlay([report(1), report(1)]), /distinct complete/);
  const emptyBaseline = report(2); emptyBaseline.arms.none.ratings = ratings(0, 0);
  assert.throws(() => decideCardOverlay([report(1), emptyBaseline]), /too few/);
  assert.throws(() => decideCardOverlay([report(1), { ...report(2), build: 'another-candidate' }]), /same served candidate/);
  assert.throws(() => decideCardOverlay([report(1), { ...report(2), cleanup: { clean: false } }]), /clean runs/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleVerdict, summarizeHoldout, type RoleRun } from './roleVerdict.mts';

const clean = summarizeHoldout([{ id: 'h01', score: { valid: true, shape: true } }, { id: 'h02', score: { valid: true, shape: true } }]);
const run = (patch: Partial<RoleRun> = {}): RoleRun => ({ bundle: 'b1', meetsFloors: true, holdout: clean, ...patch });

test('a hold-out row that is invalid or off-shape is a miss', () => {
  const summary = summarizeHoldout([
    { id: 'h01', score: { valid: true, shape: true } },
    { id: 'h02', score: { valid: false, shape: false } },
    { id: 'h03', score: { valid: true, shape: false } },
  ]);
  assert.deepEqual(summary.misses, ['h02', 'h03']);
  assert.deepEqual(summary.validity, { passed: 2, total: 3 });
  assert.deepEqual(summary.opShape, { passed: 1, total: 3 });
});

test('recommended only when both runs meet every floor and the hold-out has no miss', () => {
  assert.equal(roleVerdict([run(), run()], { holdoutRequired: true }).verdict, 'recommended');
});

test('one run below a floor is not recommended, whatever the other run did', () => {
  const verdict = roleVerdict([run(), run({ meetsFloors: false })], { holdoutRequired: true });
  assert.equal(verdict.verdict, 'not recommended');
  assert.match(verdict.reason, /run 2/);
});

test('an unscored floor is not a met floor', () => {
  assert.equal(roleVerdict([run({ meetsFloors: null }), run()], { holdoutRequired: false }).verdict, 'not recommended');
});

test('a hold-out miss in either run says the fixture floors are met but generalisation is not shown', () => {
  const missed = summarizeHoldout([{ id: 'h04', score: { valid: true, shape: false } }]);
  const verdict = roleVerdict([run(), run({ holdout: missed })], { holdoutRequired: true });
  assert.equal(verdict.verdict, 'fixture floors met; generalisation not shown');
  assert.match(verdict.reason, /run 2: h04/);
});

test('one run, three runs or two bundles are incomplete, never a verdict', () => {
  assert.equal(roleVerdict([run()], { holdoutRequired: false }).verdict, 'incomplete');
  assert.equal(roleVerdict([run(), run(), run()], { holdoutRequired: false }).verdict, 'incomplete');
  assert.equal(roleVerdict([run(), run({ bundle: 'b2' })], { holdoutRequired: false }).verdict, 'incomplete');
});

test('a required hold-out that was not scored is incomplete, not recommended', () => {
  assert.equal(roleVerdict([run(), run({ holdout: null })], { holdoutRequired: true }).verdict, 'incomplete');
  assert.equal(roleVerdict([run({ holdout: null }), run({ holdout: null })], { holdoutRequired: false }).verdict, 'recommended');
});

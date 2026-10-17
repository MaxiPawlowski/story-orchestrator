import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armState, changeOf, compareArms, type ArmReport } from './lib/armCompare.mts';

const prints = { prompt: 'p1', scorer: 2, model: 'm1', config: 'c1' };
const report = (passes: Record<string, boolean>, fingerprints = prints): ArmReport => ({ fingerprints, results: Object.entries(passes).map(([name, pass]) => ({ name, pass })) });

test('v2.8 35 G5: the compare classifier names every class on a synthetic 4-report set', () => {
  const a1 = report({ keep: true, regress: true, improve: false, flakyA: true, flakyB: true, gone: true });
  const a2 = report({ keep: true, regress: true, improve: false, flakyA: false, flakyB: true, gone: true });
  const b1 = report({ keep: true, regress: false, improve: true, flakyA: true, flakyB: true, fresh: false });
  const b2 = report({ keep: true, regress: false, improve: true, flakyA: true, flakyB: false, fresh: false });
  const result = compareArms(a1, a2, b1, b2);
  const byKey = Object.fromEntries(result.rows.map((row) => [row.key, row.change]));
  assert.deepEqual(byKey, { keep: 'unchanged', regress: 'regressed', improve: 'improved', flakyA: 'flaky', flakyB: 'flaky', gone: 'removed', fresh: 'new' });
  assert.deepEqual(result.counts, { regressed: 1, improved: 1, unchanged: 1, flaky: 2, new: 1, removed: 1 });
  assert.equal(result.label, 'comparable');
});

test('v2.8 35 G5: regressed only on stable-pass to stable-fail', () => {
  assert.equal(changeOf(armState(true, false), armState(false, false)), 'flaky');
  assert.equal(changeOf(armState(true, true), armState(true, false)), 'flaky');
  assert.equal(changeOf(armState(true, true), armState(false, false)), 'regressed');
  assert.equal(armState(undefined, true), 'missing');
});

test('v2.8 35 G5: tiers are compared as their own rows', () => {
  const tiered = (pass: boolean): ArmReport => ({ fingerprints: prints, results: [{ name: 'x', pass: true, tiers: [{ tier: 'facts', pass }] }] });
  const rows = compareArms(tiered(true), tiered(true), tiered(false), tiered(false)).rows;
  assert.deepEqual(rows.map((row) => `${row.key}=${row.change}`), ['x=unchanged', 'x:facts=regressed']);
});

test('v2.8 35 G8: a compare across differing fingerprints is labelled, unless declared', () => {
  const a = report({ x: true });
  const b = report({ x: true }, { ...prints, model: 'm2' });
  assert.equal(compareArms(a, a, b, b).label, 'not comparable: fingerprints differ (model)');
  assert.equal(compareArms(a, a, b, b, ['model']).label, 'comparable');
  assert.equal(compareArms({ results: [] }, { results: [] }, b, b).label, "not comparable: an arm's two runs differ in fingerprints");
  assert.equal(compareArms(a, report({ x: true }, { ...prints, prompt: 'p9' }), a, a).comparable, false);
});

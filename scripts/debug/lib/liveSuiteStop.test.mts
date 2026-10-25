import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveSuiteDeclaration, liveSuiteItem, stoppedVerdict } from './liveSuiteStop.mts';
import { evaluateStop } from './stopRule.mts';

const fixtures = (count: number, intents = false) => Array.from({ length: count }, () => ({ expected: intents ? { intents: [] } : {} }));

test('the declaration carries --min and every positive tier floor; record, arm and intents need every fixture', () => {
  const declaration = liveSuiteDeclaration(fixtures(20), { min: 0.9, floors: { facts: 0.85, rejected: 0, intents: 0.8 } });
  assert.deepEqual(declaration.floors.map((floor) => `${floor.id}>=${floor.rate}`), ['plot>=0.9', 'facts>=0.85']);
  assert.equal(declaration.needsAll, false);
  assert.equal(liveSuiteDeclaration(fixtures(20), { min: 0.9, floors: {}, record: true }).needsAll, true);
  assert.equal(liveSuiteDeclaration(fixtures(20), { min: 0.9, floors: {}, arm: 'r1' }).needsAll, true);
  assert.equal(liveSuiteDeclaration(fixtures(20, true), { min: 0.9, floors: { intents: 0.8 } }).needsAll, true);
  assert.equal(liveSuiteDeclaration(fixtures(20, true), { min: 0.9, floors: { intents: 0 } }).needsAll, false);
});

test('--min 0.9 over 20 fixtures: a third plot miss stops S1 once the pilot ran; a tier miss counts on its own floor', () => {
  const declaration = liveSuiteDeclaration(fixtures(20), { min: 0.9, floors: { facts: 0.5 } });
  const items = [false, false, false, true, true].map((pass) => liveSuiteItem(pass, [{ tier: 'deltas', pass }, { tier: 'facts', pass: true }]));
  assert.equal(evaluateStop(declaration, items.slice(0, 4)).stop, null);
  assert.equal(evaluateStop(declaration, items).stop?.rule, 'S1');
  assert.deepEqual('metrics' in items[0] ? Object.keys(items[0].metrics) : null, ['plot', 'facts']);
});

test('a stopped verdict replaces the run verdict', () => {
  const counts = { items: 5, planned: 20, measured: 5, plumbing: 0, metrics: {} };
  assert.deepEqual(stoppedVerdict(null, { ok: false, reasons: ['x'] }), { ok: false, reasons: ['x'] });
  assert.deepEqual(stoppedVerdict({ stopped: 'S4', verdict: 'pass', at: '15/20', reason: 'r', counts }, { ok: false, reasons: ['ran 15'] }), { ok: true, reasons: [] });
  const fail = stoppedVerdict({ stopped: 'S5', verdict: 'not-a-measurement', at: '3/20', reason: 'plumbing', counts }, { ok: false, reasons: ['incomplete fixture(s): a', 'plot low'] });
  assert.deepEqual(fail, { ok: false, reasons: ['stopped S5 at 3/20: plumbing (not a measurement)', 'plot low'] });
});

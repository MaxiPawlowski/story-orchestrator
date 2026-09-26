import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { F3_FLOORS, f3Verdict, matchesEpistemic, matchesLedger, scoreArm, sliceTotals } from './lib/sceneArmsScore.mts';
import { loadScenes } from './so-f3-arms.mts';

const expected = {
  epistemic: [{ setAt: 41, tag: 'knows', subject: 'Orin', needles: ['poison'] }, { setAt: 41, subject: 'Selene', tags: ['unaware', 'hiding'], needles: ['poison'] }],
  ledger: [],
  forbidden: [{ tag: 'knows', subject: 'Selene', needles: ['poison'] }],
};

test('v2.5 plan 05 F3: an item matches on tag, subject and every needle, case-insensitive', () => {
  assert.equal(matchesEpistemic(expected.epistemic[0], { tag: 'knows', subject: 'Orin', content: 'the envoy will be POISONED' }), true);
  assert.equal(matchesEpistemic(expected.epistemic[0], { tag: 'suspects', subject: 'Orin', content: 'poison' }), false);
  assert.equal(matchesEpistemic(expected.epistemic[1], { tag: 'hiding', subject: 'Orin', hiddenFrom: 'Selene', content: 'poison' }), false, 'the subject is who holds the state, not who it is hidden from');
  assert.equal(matchesEpistemic(expected.epistemic[1], { tag: 'unaware', subject: 'Selene', content: 'the envoy is to be poisoned' }), true);
  assert.equal(matchesLedger({ entity: 'Silver Chest', field: 'location', needles: ['cellar'] }, { entity: 'Silver Chest', field: 'location', value: 'inn cellar' }), true);
  assert.equal(matchesLedger({ entity: 'Silver Chest', field: 'location', needles: ['cellar'] }, { entity: 'Silver Chest', field: 'owner', value: 'cellar' }), false);
});

test('v2.5 plan 05 F3: an arm scores recall over items and counts forbidden signals', () => {
  const score = scoreArm(expected, { epistemic: [{ tag: 'knows', subject: 'Orin', content: 'poison' }, { tag: 'knows', subject: 'Selene', content: 'poison at the feast' }], ledger: [], promptChars: 900 });
  assert.deepEqual(score, { items: 2, found: 1, signals: 2, forbiddenHits: 1, promptChars: 900 });
  const totals = sliceTotals([score]);
  assert.equal(totals.recall, 0.5);
  assert.equal(totals.precision, 0.5);
});

const slice = (recall: number, precision: number, promptChars: number) => ({ items: 10, found: recall * 10, signals: 10, forbiddenHits: Math.round((1 - precision) * 10), promptChars, recall, precision });

test('v2.5 plan 05 F3: the predeclared floors decide, each failing on its own', () => {
  assert.deepEqual(F3_FLOORS, { recallGain: 0.25, precisionDrop: 0.1, costRatio: 3 });
  const green = f3Verdict({ long: { A: slice(0.2, 1, 1000), B: slice(0.6, 1, 2500) }, short: { A: slice(0.8, 1, 500), B: slice(0.8, 1, 500) } });
  assert.equal(green.build, true, green.reasons.join('; '));
  assert.match(f3Verdict({ long: { A: slice(0.2, 1, 1000), B: slice(0.4, 1, 1000) }, short: { A: slice(0.8, 1, 500), B: slice(0.8, 1, 500) } }).reasons.join(), /long-slice recall gain/);
  assert.match(f3Verdict({ long: { A: slice(0.2, 1, 1000), B: slice(0.6, 1, 1000) }, short: { A: slice(0.8, 1, 500), B: slice(0.7, 1, 500) } }).reasons.join(), /short-slice recall lost/);
  assert.match(f3Verdict({ long: { A: slice(0.2, 1, 1000), B: slice(0.6, 0.8, 1000) }, short: { A: slice(0.8, 1, 500), B: slice(0.8, 0.8, 500) } }).reasons.join(), /precision drop/);
  assert.match(f3Verdict({ long: { A: slice(0.2, 1, 1000), B: slice(0.6, 1, 4000) }, short: { A: slice(0.8, 1, 500), B: slice(0.8, 1, 1000) } }).reasons.join(), /prompt cost/);
});

test('v2.5 plan 05 F3: the measurement set loads, with five long scenes and two short ones', async () => {
  const scenes = await loadScenes(path.join(process.cwd(), 'test/fixtures/f3-scene'));
  assert.deepEqual(scenes.map((scene) => `${scene.slice}:${scene.name}`), ['long:long-1-envoy', 'long:long-2-well', 'long:long-3-ink', 'long:long-4-silver', 'long:long-5-map', 'short:short-1-ledger', 'short:short-2-cellar']);
  const es = await loadScenes(path.join(process.cwd(), 'test/fixtures/pending-es/f3-scene'));
  assert.deepEqual(es.map((scene) => scene.lang), ['es']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneProblems, noModelJourneys, noModelScenarios, summarizeBatch } from './nomodelSuite.mts';
import { noLlmPartition } from '../../lib/suiteDecisions.mjs';

test('the scenario list is the kept no-model rows that declare model none', () => {
  const rows = [
    { path: 'a.json', shape: { needsLlm: false }, requires: { lane: 'no-model' }, decision: 'keep' },
    { path: 'b.json', shape: { needsLlm: false }, requires: { lane: 'no-model', prior: 'J3' }, decision: 'keep' },
    { path: 'c.json', shape: { needsLlm: false }, requires: { lane: 'model' }, decision: 'keep' },
    { path: 'd.json', shape: { needsLlm: false }, requires: { lane: 'no-model' }, decision: 'fix', reason: 'no assertion step' },
    { path: 'e.json', shape: { needsLlm: true }, requires: {}, decision: 'keep' },
  ];
  const classes: Record<string, string> = { 'a.json': 'none', 'b.json': 'none', 'c.json': 'any', 'd.json': 'none', 'e.json': 'judged' };
  const out = noModelScenarios(rows, (path) => classes[path], (list) => noLlmPartition(list).noModel);
  assert.deepEqual(out.scenarios, ['a.json']);
  assert.deepEqual(out.problems, []);
  assert.equal(out.left.length, 2);
  assert.match(out.left.join(), /b\.json: needs a prior step/);
  assert.match(out.left.join(), /d\.json: decision fix/);
  const wrong = noModelScenarios(rows, (path) => (path === 'a.json' ? 'any' : classes[path]), (list) => noLlmPartition(list).noModel);
  assert.match(wrong.problems.join(), /a\.json: on the no-LLM no-model list but declares model any/);
});

test('journeys contribute their none checks whose dependencies are none', () => {
  const journeys = [
    { id: 'J1', checks: [{ id: 'J1.1', model: 'any' }, { id: 'J1.2', model: 'none', dependsOn: ['J1.1'] }, { id: 'J1.3', model: 'none' }, { id: 'J1.4', model: 'none', mode: 'human' }] },
    { id: 'J2', checks: [{ id: 'J2.1', model: 'judged' }] },
    { id: 'J3', status: 'reserved', checks: [{ id: 'J3.1', model: 'none' }] },
  ];
  assert.deepEqual(noModelJourneys(journeys), [{ id: 'J1', checks: ['J1.3'] }]);
});

test('a lane with a model, down or unseeded is refused', () => {
  const status = [
    { lane: 30, seeded: true, serverUp: true, noModel: true },
    { lane: 31, seeded: true, serverUp: true, noModel: false },
    { lane: 32, seeded: false, serverUp: false, noModel: false },
  ];
  assert.deepEqual(laneProblems(status, [30]), []);
  assert.match(laneProblems(status, [31]).join(), /lane 31: has a model/);
  assert.equal(laneProblems(status, [32]).length, 3);
  assert.match(laneProblems(status, [33]).join(), /not listed/);
});

test('the summary is ok only when every row is green', () => {
  assert.equal(summarizeBatch([]).ok, false);
  assert.equal(summarizeBatch([{ item: 'a', lane: 30, run: 1, status: 'GREEN' }]).ok, true);
  const mixed = summarizeBatch([
    { item: 'a', lane: 30, run: 1, status: 'GREEN' },
    { item: 'b', lane: 31, run: 1, status: 'RED', failures: ['FAIL x'] },
    { item: 'c', lane: 32, run: 1, status: 'NOT-RUNNABLE', notRunnable: 'needs group' },
    { item: 'd', lane: 33, run: 1, status: 'INCOMPLETE', evidence: { problems: ['no record'] } },
  ]);
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.counts, { GREEN: 1, RED: 1, INCOMPLETE: 1, 'NOT-RUNNABLE': 1 });
  assert.equal(mixed.lines.length, 3);
  assert.match(mixed.lines.join('\n'), /NOT-RUNNABLE +c \(lane 32\): needs group/);
});

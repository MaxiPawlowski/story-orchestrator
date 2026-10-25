import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import { stepsShape } from '../../lib/suiteInventory.mjs';
import { censusProblems, dependencyClosure, modelSelection, noModelRunnable, parseModelFilter, scenarioModelSkip, type CensusEntry } from './modelClass.mts';
import { validateFixture } from './scenarioSchema.mts';
import { itemArgs } from '../st-lanes.mts';

const SCENARIOS = join(REPO_ROOT, 'test', 'scenarios');
const JOURNEYS = join(REPO_ROOT, 'test', 'journeys');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));

function census(): CensusEntry[] {
  const entries: CensusEntry[] = [];
  for (const file of readdirSync(SCENARIOS).filter((name) => name.endsWith('.json')).sort()) {
    const doc = read(join(SCENARIOS, file));
    if (!Array.isArray(doc?.steps)) continue;
    entries.push({ where: `test/scenarios/${file}`, model: doc.model, needsLlm: stepsShape(doc.steps).needsLlm, lane: doc.requires?.lane ?? null });
  }
  for (const file of readdirSync(JOURNEYS).filter((name) => name.endsWith('.journey.json')).sort()) {
    const doc = read(join(JOURNEYS, file));
    for (const check of doc.checks ?? []) entries.push({ where: `test/journeys/${file} ${check.id}`, model: check.model, needsLlm: stepsShape(check.steps).needsLlm });
  }
  return entries;
}

test('census: every top-level scenario and every journey check declares a model class that fits its steps', () => {
  const entries = census();
  assert.ok(entries.length > 400, `census found only ${entries.length} entries`);
  assert.deepEqual(censusProblems(entries), []);
});

test('census planted controls: a missing, unknown or contradicted class is a problem', () => {
  const problems = censusProblems([
    { where: 'a', model: undefined, needsLlm: false },
    { where: 'b', model: 'maybe', needsLlm: false },
    { where: 'c', model: 'any', needsLlm: false, lane: 'no-model' },
    { where: 'd', model: 'none', needsLlm: true },
    { where: 'e', model: 'none', needsLlm: false, lane: 'model' },
    { where: 'f', model: 'judged', needsLlm: true, lane: 'model' },
  ]);
  assert.equal(problems.length, 5);
  assert.ok(problems.every((problem) => !problem.startsWith('f')));
});

test('the schema refuses an unknown model class on a scenario and on a journey check', () => {
  assert.equal(validateFixture({ model: 'none', steps: [] }, 's').length, 0);
  assert.match(validateFixture({ model: 'gpu', steps: [] }, 's').join(), /s\.model/);
  assert.match(validateFixture({ checks: [{ id: 'J1.1', model: 'gpu', steps: [] }] }, 'j').join(), /j\.J1\.1\.model/);
});

test('parseModelFilter takes a comma list of the three classes', () => {
  assert.equal(parseModelFilter(null), null);
  assert.deepEqual(parseModelFilter('none, any,none'), ['none', 'any']);
  assert.throws(() => parseModelFilter('gpu'));
  assert.throws(() => parseModelFilter(''));
});

const checks = [
  { id: 'X.1', model: 'any' },
  { id: 'X.2', model: 'none', dependsOn: ['X.1'] },
  { id: 'X.3', model: 'judged', dependsOn: ['X.1'] },
  { id: 'X.4', model: 'none' },
  { id: 'X.5', model: 'none', dependsOn: ['X.4'] },
  { id: 'X.6', model: 'none', mode: 'human' },
];

test('a model filter selects by class and pulls in declared dependencies', () => {
  const judged = modelSelection(checks, ['judged']);
  assert.deepEqual(judged.only, ['X.1', 'X.3']);
  assert.deepEqual(judged.pulled, ['X.1']);
  assert.deepEqual(Object.keys(judged.deselected), ['X.2', 'X.4', 'X.5', 'X.6']);
  const none = modelSelection(checks, ['none'], ['X.4', 'X.5', 'X.3']);
  assert.deepEqual(none.selected, ['X.4', 'X.5']);
  assert.deepEqual(Object.keys(none.deselected), ['X.3']);
  const noModel = modelSelection(checks, ['none']);
  assert.deepEqual(noModel.only, ['X.4', 'X.5', 'X.6']);
  assert.deepEqual(noModel.pulled, []);
  assert.ok('X.2' in noModel.deselected, 'a none check depending on a model check is not run by a none-only filter');
  assert.deepEqual(modelSelection(checks, ['none', 'any']).only, ['X.1', 'X.2', 'X.4', 'X.5', 'X.6']);
  assert.deepEqual(dependencyClosure(checks, ['X.5']), ['X.4', 'X.5']);
});

test('only none checks whose dependencies are all none can run on a no-model lane', () => {
  assert.deepEqual(noModelRunnable(checks), ['X.4', 'X.5']);
});

test('a scenario is skipped when its class is not selected or undeclared', () => {
  assert.equal(scenarioModelSkip({ model: 'none' }, ['none']), null);
  assert.match(String(scenarioModelSkip({ model: 'judged' }, ['none', 'any'])), /model class judged not selected/);
  assert.match(String(scenarioModelSkip([], ['none'])), /undeclared/);
});

test('st-lanes batch forwards --model to both runners', () => {
  assert.deepEqual(itemArgs('J3', true, null, null, 'none').slice(-2), ['--model', 'none']);
  assert.deepEqual(itemArgs('test/scenarios/x.json', true, 'g', null, 'none').slice(-2), ['--model', 'none']);
  assert.ok(!itemArgs('J3', true, null).includes('--model'));
});

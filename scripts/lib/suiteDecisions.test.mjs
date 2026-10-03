import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideAsset, GENERATED, journeyMinutes, noLlmSuiteRows, suiteBudget, suiteRowProblems, TOY_GROUP } from './suiteDecisions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = JSON.parse(readFileSync(join(ROOT, 'test', 'findings', 'suite-decisions.json'), 'utf-8'));
const llm = { needsLlm: true, vacuous: false };

test('a spike leg is demoted, a route pair is a merge candidate, an unnamed LLM scenario leaves the suite', () => {
  assert.equal(decideAsset('scenario', { path: 'test/scenarios/live-v25-09-sp4-t3-append.json', shape: llm, guard: 'defect' }, config).decision, 'demote');
  assert.equal(decideAsset('scenario', { path: 'test/scenarios/live-generated-fork-a.json', shape: llm, guard: 'contract' }, config).decision, 'merge');
  assert.equal(decideAsset('scenario', { path: 'test/scenarios/live-x.json', shape: llm, guard: 'nothing named' }, config).decision, 'demote');
  assert.equal(decideAsset('scenario', { path: 'test/scenarios/live-x.json', shape: llm, guard: 'defect' }, config).decision, 'keep');
  assert.equal(decideAsset('scenario', { path: 'test/scenarios/x.json', shape: { needsLlm: false }, guard: 'nothing named' }, config).decision, 'keep', 'the deterministic tier is cheap: kept');
});

test('jest is kept whole; a vacuous file is a fix, and a replay killer says which defect it guards', () => {
  assert.equal(decideAsset('jest', { vacuous: true }, config).decision, 'fix');
  assert.match(decideAsset('jest', { replay: ['nan-host-message-id (killed)'], guard: 'defect' }, config).reason, /nan-host-message-id/);
  assert.match(decideAsset('jest', { replay: [], guard: 'nothing named', fixes: 2 }, config).reason, /unnamed/);
});

test('a vacuous live needle is a fix; a fixture with real needles is kept', () => {
  assert.equal(decideAsset('live', { name: 'extractor9', vacuous: ['facts.mustContain: ""'], tiers: [] }, config).decision, 'fix');
  assert.equal(decideAsset('live', { name: 'extractor21', vacuous: [], tiers: ['deltas'] }, config).decision, 'keep');
});

test('journey minutes prefer a measured median, and the budget compares x2 with two nights of lanes', () => {
  assert.deepEqual(journeyMinutes({ id: 'J7', estSeconds: 60 }, { journeyMinutes: { J7: 42 }, overheadMinutes: 3 }).minutes, 45);
  assert.equal(journeyMinutes({ id: 'J1', estSeconds: 240 }, { journeyMinutes: {}, overheadMinutes: 3 }).minutes, 7);
  const budget = suiteBudget([{ name: 'a', llm: true, rows: [{ minutes: 600, capMinutes: 300 }] }, { name: 'b', llm: false, rows: [{ minutes: 999 }] }], { nightHours: 10, lanes: 2 });
  assert.equal(budget.llmHours, 10);
  assert.equal(budget.cappedHours, 5);
  assert.equal(budget.capacityHours, 40);
  assert.equal(budget.fitsCapped, true);
  assert.equal(suiteBudget([{ name: 'a', llm: true, rows: [{ minutes: 1500 }] }], { nightHours: 10, lanes: 2 }).gapHours, 10);
});

const onDisk = (path) => existsSync(join(ROOT, path));

test('every hand row of the final suite is runnable: command, condition, artifacts, tier, and the files it names exist', () => {
  const problems = config.handRows.flatMap((section) => section.rows.flatMap((row) => suiteRowProblems(row, onDisk)));
  assert.deepEqual(problems, []);
  assert.equal('placeholders' in config, false);
});

test('generated journey and scenario rows carry a runnable command and the engine-history artifact', () => {
  assert.deepEqual(suiteRowProblems({ id: 'J3', what: 'x', ...GENERATED.journey('J3') }, onDisk), []);
  assert.match(GENERATED.journey('J3').artifacts.join(' '), /engine-history/);
  assert.deepEqual(suiteRowProblems({ id: 's', what: 'kept', ...GENERATED.scenario('test/scenarios/live-v24-01-t1.json') }, onDisk), []);
});

test('negative controls: a placeholder, a missing command, tier, artifact or condition, and a missing file are each refused', () => {
  const good = { id: 'ok', what: 'x', command: 'node scripts/debug/so-journey.mts run J3', when: 'always', artifacts: ['record'], tier: 'T7' };
  assert.deepEqual(suiteRowProblems(good, onDisk), []);
  assert.match(suiteRowProblems({ ...good, note: 'placeholder: plan 99 not built' }, onDisk).join(), /placeholder/);
  assert.match(suiteRowProblems({ ...good, command: 'run it somehow' }, onDisk).join(), /no runnable command/);
  assert.match(suiteRowProblems({ ...good, tier: 'T9' }, onDisk).join(), /tier/);
  assert.match(suiteRowProblems({ ...good, artifacts: [] }, onDisk).join(), /artifact/);
  assert.match(suiteRowProblems({ ...good, when: '' }, onDisk).join(), /run condition/);
  assert.match(suiteRowProblems({ ...good, command: 'node scripts/debug/so-not-a-script.mts run' }, onDisk).join(), /does not exist/);
  assert.deepEqual(suiteRowProblems({ ...good, command: 'node scripts/debug/st-lanes.mts batch <campaign>/lab/x.json test/scenarios/<file>.json' }, onDisk), []);
});

test('the no-LLM row splits by the lane each scenario requires, keeps prior-step files out of batches, and lists every precondition', () => {
  const scenarios = [
    { asset: 'test/scenarios/a.json', est: 60, requires: {} },
    { asset: 'test/scenarios/b.json', est: 60, requires: { lane: 'no-model', why: 'the pass must fail' } },
    { asset: 'test/scenarios/c.json', est: 120, requires: { lane: 'model', group: "Adolion - The Adventurer's Road", members: ['Tobias'], judge: 'off' } },
    { asset: 'test/scenarios/d.json', est: 60, requires: { prior: 'so-timeout-arm scale <base-run.log>' } },
  ];
  const plan = noLlmSuiteRows(scenarios);
  assert.equal(plan.rows.length, 2);
  const [noModel, live] = plan.rows;
  assert.match(noModel.command, /st-lanes\.mts no-model <n>.*batch .*--group 1759606632088 test\/scenarios\/b\.json; .*restore-model <n>$/);
  assert.doesNotMatch(noModel.command, /a\.json|c\.json|d\.json/);
  assert.match(live.command, /--group 1759606632088 test\/scenarios\/a\.json test\/scenarios\/c\.json$/);
  assert.equal(live.minutes, 3);
  assert.deepEqual(plan.excluded, [{ asset: 'test/scenarios/d.json', prior: 'so-timeout-arm scale <base-run.log>' }]);
  assert.deepEqual(plan.preconditions.map((row) => [row.asset, row.lane, row.needs]), [
    ['test/scenarios/b.json', 'no-model', ''],
    ['test/scenarios/c.json', 'model', "group Adolion - The Adventurer's Road; members Tobias; judge off"],
    ['test/scenarios/d.json', 'any', ''],
  ]);
  const exists = () => true;
  for (const row of plan.rows) assert.deepEqual(suiteRowProblems(row, exists), []);
  assert.equal(TOY_GROUP, '1759606632088');
  assert.match(noLlmSuiteRows(scenarios, { group: 'X' }).rows[1].command, /--group X /);
  assert.deepEqual(noLlmSuiteRows([]).rows, []);
});

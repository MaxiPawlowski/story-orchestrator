import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REPO_ROOT } from './bundleEntry.mts';
import { batchListProblems, listPlanLines, loadBatchLists, parseListSpec, rowPlan, selectList, type BatchListsFile, type BatchRow } from './batchLists.mts';

const row = (extra: Partial<BatchRow>): BatchRow => ({ id: 'r', kind: 'scenario', target: 'x', model: 'any', controller: true, ...extra });

test('the controller regression lists name only rows that exist with the class they declare', () => {
  const file = loadBatchLists(REPO_ROOT, 'controller-regression');
  assert.deepEqual(batchListProblems(file, REPO_ROOT), []);
  assert.ok(['base', 'mtp', 'reclaim', 'timing', 'cache', 'max-profile', 'idle-prefill', 'parallel', 'request-checkpoints'].every((name) => file.lists[name]));
});

test('every new F3 check the audit asked for is a row, and the GPU ones say so', () => {
  const rows = Object.values(loadBatchLists(REPO_ROOT, 'controller-regression').lists).flatMap((list) => list.rows);
  const added = rows.filter((entry) => entry.new).map((entry) => entry.id).sort();
  assert.deepEqual(added, ['comfy-kill', 'director-render-reload', 'gbnf-parity', 'inner-freshness', 'reserve-judge-gpu', 'reserve-landmarks', 'reserve-live-head', 'send-latency']);
  for (const entry of rows.filter((candidate) => candidate.new)) assert.notEqual(rowPlan(entry), 'no-model', entry.id);
});

test('the census refuses a planted wrong class, an unknown journey, a missing file and a controller none row', () => {
  const planted: BatchListsFile = {
    format: 'so-batch-lists/1', title: 't', source: 's', rules: [],
    lists: { one: { why: 'w', rows: [
      row({ id: 'wrong-class', target: 'test/scenarios/effects-preset.json', model: 'any' }),
      row({ id: 'no-journey', kind: 'journey', target: 'J99', model: 'any' }),
      row({ id: 'no-class', kind: 'journey', target: 'J13', model: 'none', controller: false }),
      row({ id: 'gone', target: 'test/scenarios/nope.json' }),
      row({ id: 'none-controller', target: 'test/scenarios/effects-preset.json', model: 'none', controller: true }),
      row({ id: 'script-gpu', kind: 'script', target: 'node scripts/debug/nope.mts' }),
      row({ id: 'wrong-class', kind: 'script', target: 'TODO', missing: true, gpu: true }),
    ] } },
  };
  const problems = batchListProblems(planted, REPO_ROOT).join('\n');
  assert.match(problems, /wrong-class: test\/scenarios\/effects-preset.json declares model "none", the row says any/);
  assert.match(problems, /no-journey: no journey J99/);
  assert.match(problems, /no-class: journey J13 has no none check/);
  assert.match(problems, /gone: test\/scenarios\/nope.json does not exist/);
  assert.match(problems, /none-controller: a none row never reaches the controller/);
  assert.match(problems, /script-gpu: a script row states gpu/);
  assert.match(problems, /script-gpu: scripts\/debug\/nope.mts does not exist/);
  assert.match(problems, /id used twice/);
});

test('rowPlan: judged on the GPU, controller any rows record once then replay, other any rows replay, none on no-model lanes', () => {
  assert.equal(rowPlan(row({ model: 'judged' })), 'gpu');
  assert.equal(rowPlan(row({ model: 'any', controller: true })), 'record-then-replay');
  assert.equal(rowPlan(row({ model: 'any', controller: false })), 'replay');
  assert.equal(rowPlan(row({ model: 'none', controller: false })), 'no-model');
  assert.equal(rowPlan(row({ kind: 'script', gpu: true })), 'gpu');
  assert.equal(rowPlan(row({ kind: 'script', missing: true })), 'missing');
  assert.equal(rowPlan(row({ branch: 'b' })), 'other-branch');
});

test('selectList picks journey and scenario rows of the filtered classes once each, prints scripts and names what it cannot run', () => {
  const file = loadBatchLists(REPO_ROOT, 'controller-regression');
  const { file: name, names } = parseListSpec('controller-regression:base,cache');
  assert.equal(name, 'controller-regression');
  const replay = selectList(file, 'controller-regression:base,cache', names, 'none,any');
  assert.ok(replay.items.includes('GS1'));
  assert.equal(replay.items.filter((item) => item === 'GS1').length, 1);
  assert.ok(replay.items.includes('test/scenarios/live-rollback-derived.json'));
  assert.ok(replay.deselected.includes('gs1-judged'));
  assert.equal(replay.repeat, 2);
  assert.ok(replay.scripts.some((entry) => entry.id === 'payload-goldens'));
  assert.ok(replay.notBatchable.some((entry) => entry.id === 'full-length' && entry.plan === 'other-branch'));
  assert.ok(replay.notBatchable.some((entry) => entry.id === 'impersonate-roundtrip' && entry.plan === 'missing'));
  const lines = listPlanLines(replay).join('\n');
  assert.match(lines, /run separately \(no-model\): node scripts\/debug\/so-payload-golden.mts/);
  assert.match(lines, /not batchable \(other-branch on v3.0-09-controller-r3\): full-length/);
  const judged = selectList(file, 'controller-regression:base', ['base'], 'judged');
  assert.deepEqual(judged.items, ['GS1', 'J5', 'J13 --judge-uses houseRules --warden-mode auto']);
  assert.throws(() => selectList(file, 'x', ['nope'], null), /unknown list/);
  assert.throws(() => parseListSpec('../etc'), /--list takes/);
});

test('C-H3: J13 runs on its on arm from the list, and the census refuses arm flags it cannot pass', () => {
  const file = loadBatchLists(REPO_ROOT, 'controller-regression');
  const j13 = file.lists.base.rows.find((entry) => entry.id === 'j13-judged');
  assert.deepEqual(j13?.args, ['--judge-uses', 'houseRules', '--warden-mode', 'auto']);
  const planted: BatchListsFile = {
    format: 'so-batch-lists/1', title: 't', source: 's', rules: [],
    lists: { one: { why: 'w', rows: [
      row({ id: 'scenario-args', target: 'test/scenarios/effects-preset.json', model: 'none', controller: false, args: ['--judge-uses', 'off'] }),
      row({ id: 'odd-args', kind: 'journey', target: 'J13', model: 'judged', args: ['--judge-uses'] }),
      row({ id: 'foreign-flag', kind: 'journey', target: 'J13', model: 'judged', args: ['--no-config', 'x'] }),
    ] } },
  };
  const problems = batchListProblems(planted, REPO_ROOT).join(' | ');
  assert.match(problems, /scenario-args: args are journey arm flags/);
  assert.match(problems, /odd-args: args must be flag\/value pairs/);
  assert.match(problems, /foreign-flag: args: "--no-config" is not one of --judge-uses, --warden-mode/);
});

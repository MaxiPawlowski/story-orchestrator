import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideAsset, journeyMinutes, suiteBudget } from './suiteDecisions.mjs';

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

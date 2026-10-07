import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  b1Problems, combineRuns, growth, insideRepo, labProblems, labellerProblems, leakedText, liveRead, percentile, readB1Facts, recordPath, runNumber, writeB1Record,
} from './lib/b1Runs.mts';
import { B1_RUNNERS } from './lib/b1Registry.mts';
import { combine } from './so-b1.mts';

const g = globalThis as Record<string, any>;
afterEach(() => { delete g.SillyTavern; delete g.storyOrchestratorLiveSuite; delete g.storyOrchestratorRuntime; delete g.storyOrchestratorJudge; });
const fakePage = { evaluate: (fn: (arg: unknown) => unknown, arg?: unknown) => fn(arg) };
const manifest = JSON.parse(readFileSync(join(process.cwd(), 'test/phase-c/manifest.json'), 'utf-8'));

test('B1 runs: --run is 1 or 2, the lab stays outside this repo, and a missing lab file is named', () => {
  assert.equal(runNumber('2'), 2);
  assert.throws(() => runNumber('3'), /--run takes 1 or 2/);
  assert.throws(() => runNumber(null), /--run takes 1 or 2/);
  assert.equal(insideRepo(join(process.cwd(), 'test')), true);
  assert.equal(insideRepo('C:/dev/adolion-campaign/lab'), false);
  assert.match(labProblems(null, []).join(), /needs the campaign lab directory/);
  assert.match(labProblems(join(process.cwd(), 'test/fixtures'), []).join(), /inside this public repo/);
  assert.deepEqual(labProblems('C:/lab', ['a.json', 'b.json'], { exists: (path) => !path.endsWith('b.json') }), ['the lab directory has no b.json']);
});

test('B1 runs: a public summary that carries private text is refused before anything is written', async () => {
  const root = mkdtempSync(join(tmpdir(), 'b1-records-'));
  const debugDir = mkdtempSync(join(tmpdir(), 'b1-debug-'));
  const secret = 'The courier hid the second letter under the well.';
  assert.deepEqual(leakedText({ note: `quote: ${secret}` }, [{ text: secret }]), [secret]);
  assert.deepEqual(leakedText({ count: 3 }, [{ text: secret }]), []);
  await assert.rejects(writeB1Record({ rowId: 'X-1', run: 1, summary: { leak: secret }, raw: {}, privateText: [secret], root, debugDir }), /carries 1 private text/);
  assert.equal(existsSync(recordPath('X-1', 1, root)), false);
  const written = await writeB1Record({ rowId: 'X-1', run: 1, summary: { verdict: 'PASS' }, raw: { secret }, privateText: [secret], root, debugDir });
  assert.equal(JSON.parse(readFileSync(written.record, 'utf-8')).verdict, 'PASS');
  assert.match(readFileSync(written.raw, 'utf-8'), /second letter/);
  assert.equal(JSON.stringify(await combine('X-1', root)), JSON.stringify({ row: 'X-1', runs: ['PASS', null], verdict: 'INCOMPLETE', records: ['test/phase-c/records/X-1/run-1.json', null] }));
});

test('B1 runs: x2 combines, PASS needs both; percentiles and growth', () => {
  assert.equal(combineRuns(['PASS', 'PASS']), 'PASS');
  assert.equal(combineRuns(['PASS', 'FAIL']), 'FAIL');
  assert.equal(combineRuns(['PASS']), 'INCOMPLETE');
  assert.equal(combineRuns(['PASS', 'INCOMPLETE']), 'INCOMPLETE');
  assert.equal(combineRuns(['RECORDED', 'RECORDED']), 'RECORDED');
  assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(percentile([], 0.5), null);
  assert.equal(growth(115, 100), 0.15);
  assert.equal(growth(10, 0), null);
});

test('B1 runs (fake page): prerequisites are read from the page and every missing one is named', async () => {
  g.SillyTavern = { getContext: () => ({ extensionSettings: { connectionManager: { profiles: [{ id: 'p1', name: 'DeepSeek read' }] } }, getRequestHeaders: () => ({}) }) };
  g.storyOrchestratorLiveSuite = {};
  const realFetch = g.fetch;
  g.fetch = async () => ({ ok: true, status: 200, json: async () => ({ configured: false }) });
  try {
    const needs = { handles: ['storyOrchestratorLiveSuite', 'storyOrchestratorAgendaProposals'], judge: true, profiles: ['DeepSeek read', 'Labeller'] };
    const facts = await readB1Facts(fakePage, needs);
    const problems = b1Problems(needs, facts).join('\n');
    assert.match(problems, /storyOrchestratorAgendaProposals/);
    assert.doesNotMatch(problems, /globalThis\.storyOrchestratorLiveSuite,/);
    assert.match(problems, /judge plugin with a TypeSafe key \(no TypeSafe key\)/);
    assert.match(problems, /profile "Labeller"/);
    assert.doesNotMatch(problems, /profile "DeepSeek read"/);
  } finally {
    g.fetch = realFetch;
  }
  assert.match(labellerProblems(null, []).join(), /second-model labeller/);
  assert.match(labellerProblems({ id: 'p1', name: 'X' }, [{ role: 'curator role', profileId: 'p1' }]).join(), /a second model must label/);
  assert.deepEqual(labellerProblems({ id: 'p2', name: 'X' }, [{ role: 'curator role', profileId: 'p1' }]), []);
});

test('B1 runs (fake page): a live read times the call, measures the prompt and keeps an error as a row', async () => {
  g.storyOrchestratorLiveSuite = {
    runFixture: async (spec) => ({ prompt: `prompt for ${spec.story.title}`, rawResponse: 'NO_DELTA', deltas: [], guarded: [{ q: 'k', v: 1 }], scope: ['k'], sources: [], facts: [], rejected: [] }),
    measureBudget: async (text) => ({ estimate: text.length }),
  };
  const ok = await liveRead(fakePage, { story: { title: 'T' } });
  assert.deepEqual([ok.tokens, ok.scope, ok.guarded, ok.error], ['prompt for T'.length, ['k'], [{ q: 'k', v: 1 }], undefined]);
  g.storyOrchestratorLiveSuite.runFixture = async () => { throw new Error('profile unreachable'); };
  const failed = await liveRead(fakePage, { story: {} });
  assert.equal(failed.error, 'profile unreachable');
});

test('B1 registry: every runner-backed row is a manifest B1 row whose prerequisites name its runner, and the runner exists', () => {
  const rows = new Map(manifest.rows.map((row) => [row.id, row]));
  for (const entry of B1_RUNNERS) {
    const row = rows.get(entry.row) as { prerequisites: string[] } | undefined;
    assert.ok(row, `${entry.row} is not a manifest row`);
    assert.ok(row.prerequisites.some((text) => text.includes(entry.runner)), `${entry.row}: the manifest prerequisites do not name ${entry.runner}`);
    assert.ok(existsSync(join(process.cwd(), entry.runner)), `${entry.runner} is missing`);
    assert.ok(existsSync(join(process.cwd(), entry.scorer)), `${entry.scorer} is missing`);
  }
});

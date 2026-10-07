import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changedFiles, longestFirst, nextCache, readsTree, REPLAY_CACHE_VERSION, reusableRows, specHash } from './suiteReplayCache.mjs';
import { stageCopies, stageCopy, stageDir, stagedFiles } from './suiteStage.mjs';
import { defaultWorkers, replayVerdict } from '../suite/defect-replay.mjs';

const spec = (id, extra = {}) => ({ id, source: `${id}.json`, file: `src/${id}.ts`, find: 'a', replace: 'b', tests: [`src/${id}.test.ts`], ...extra });
const cacheOf = (specs, files, rows = specs.map((s) => ({ id: s.id, verdict: 'killed', killedBy: ['t'], killedCount: 1 }))) => nextCache({ hashes: files, specs, rows });

test('plan 26: an unchanged tree reuses every killed row, and only killed rows are stored', () => {
  const specs = [spec('a'), spec('b')];
  const files = { 'src/a.ts': '1', 'src/b.ts': '2' };
  const cache = cacheOf(specs, files, [{ id: 'a', verdict: 'killed', killedBy: [], killedCount: 1 }, { id: 'b', verdict: 'survived' }]);
  assert.deepEqual(Object.keys(cache.rows), ['a']);
  assert.equal(cache.version, REPLAY_CACHE_VERSION);
  assert.deepEqual([...reusableRows({ cache, hashes: files, specs }).reused.keys()], ['a']);
});

test('plan 26: a row is re-run when its file, its spec, a related test or the tree outside src/ changed', () => {
  const specs = [spec('a'), spec('b'), spec('c')];
  const files = { 'src/a.ts': '1', 'src/b.ts': '2', 'src/c.ts': '3', 'src/x.ts': '4', 'test/fixtures/f.json': '5', 'docs/d.md': '6' };
  const cache = cacheOf(specs, files);
  const reuse = (hashes, extra = {}) => [...reusableRows({ cache, hashes, specs, ...extra }).reused.keys()];
  assert.deepEqual(reuse({ ...files, 'src/a.ts': 'x' }), ['b', 'c']);
  assert.deepEqual(reuse({ ...files, 'src/x.ts': 'x' }, { related: new Set(['src/b.test.ts']) }), ['a', 'c']);
  assert.deepEqual(reuse({ ...files, 'docs/d.md': 'x' }), ['a', 'b', 'c']);
  assert.deepEqual(reuse({ ...files, 'test/fixtures/f.json': 'x' }), []);
  assert.deepEqual(reuse({ ...files, 'package.json': 'new' }), []);
  assert.deepEqual(reuse(files, { readsFiles: (path) => path === 'src/c.test.ts' }), ['a', 'b']);
  assert.deepEqual([...reusableRows({ cache, hashes: files, specs: [spec('a', { replace: 'c' }), specs[1], specs[2]] }).reused.keys()], ['b', 'c']);
  assert.equal(reusableRows({ cache: { ...cache, version: 0 }, hashes: files, specs }).reused.size, 0);
  assert.equal(reusableRows({ cache: null, hashes: files, specs }).reused.size, 0);
});

test('plan 26: the spec hash ignores the file name it was read from, and changes with the mutant', () => {
  assert.equal(specHash(spec('a')), specHash({ ...spec('a'), source: 'other.json' }));
  assert.notEqual(specHash(spec('a')), specHash(spec('a', { find: 'z' })));
  assert.deepEqual(changedFiles({ a: '1', b: '2' }, { a: '1', c: '3' }), ['b', 'c']);
});

test('plan 26: a test that reads the tree through fs is never cached', () => {
  assert.equal(readsTree('import { readFileSync } from "node:fs";'), true);
  assert.equal(readsTree("import * as fs from 'fs';"), true);
  assert.equal(readsTree('import { x } from "./fsHelpers";'), false);
});

test('plan 26: the slowest known rows start first, unknown ones before them, and a killed run stays a kill', () => {
  const specs = [spec('a'), spec('b'), spec('c'), spec('d')];
  const cache = { rows: { a: { ms: 5 }, b: { ms: 70 }, d: { ms: 5 } } };
  assert.deepEqual(longestFirst(specs, cache).map((s) => s.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(longestFirst(specs, null).map((s) => s.id), ['a', 'b', 'c', 'd']);
  assert.equal(nextCache({ hashes: {}, specs, rows: [{ id: 'a', verdict: 'killed', ms: 9 }] }).rows.a.ms, 9);
  const result = { success: false, numFailedTests: 1, numTotalTests: 2, testResults: [{ assertionResults: [{ status: 'failed', failureMessages: ['Exceeded timeout of 5000 ms'] }] }] };
  assert.equal(replayVerdict({ timedOut: false, result }), 'killed');
  assert.equal(replayVerdict({ timedOut: true, result: null }), 'timeout');
  assert.equal(defaultWorkers(16), 8);
  assert.equal(defaultWorkers(1), 1);
});

test('plan 26: re-staging copies only what changed and removes what the tree dropped, including a leftover mutant', async () => {
  const root = mkdtempSync(join(tmpdir(), 'so-stage-root-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), 'a');
    writeFileSync(join(root, 'src', 'b.ts'), 'b');
    const purpose = `stage-test-${process.pid}`;
    const dir = stageCopy(root, purpose, ['src/a.ts', 'src/b.ts']);
    assert.equal(stageCopy.last.copied, 2);
    assert.equal(stageCopy(root, purpose, ['src/a.ts', 'src/b.ts']).length > 0 && stageCopy.last.copied, 0);
    writeFileSync(join(dir, 'src', 'a.ts'), 'mutant');
    writeFileSync(join(dir, '.jest-result.json'), '{}');
    stageCopy(root, purpose, ['src/a.ts']);
    assert.equal(readFileSync(join(dir, 'src', 'a.ts'), 'utf-8'), 'a');
    assert.deepEqual(stagedFiles(dir).sort(), ['src/a.ts']);
    assert.equal(stageCopy.last.removed, 2);
    writeFileSync(join(dir, 'src', 'a.ts'), 'z');
    utimesSync(join(dir, 'src', 'a.ts'), new Date(0), new Date(0));
    stageCopy(root, purpose, ['src/a.ts']);
    assert.equal(readFileSync(join(dir, 'src', 'a.ts'), 'utf-8'), 'a');
    rmSync(stageDir(root, purpose), { recursive: true, force: true });
    const [first, second] = await stageCopies(root, [`${purpose}-a`, `${purpose}-b`], ['src/a.ts', 'src/b.ts']);
    assert.deepEqual([first.copied, second.copied], [2, 2]);
    assert.equal(readFileSync(join(second.dir, 'src', 'b.ts'), 'utf-8'), 'b');
    assert.deepEqual((await stageCopies(root, [`${purpose}-a`], ['src/a.ts', 'src/b.ts']))[0].copied, 0);
    for (const suffix of ['a', 'b']) rmSync(stageDir(root, `${purpose}-${suffix}`), { recursive: true, force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

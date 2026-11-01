import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { testTempDirSync } from '../../lib/testTemp.mjs';

process.env.SO_LANES_ROOT = tmpdir();
import { bundleSha, copyBundle, frozenFileFor, readLaneBundle, rowBundleProblems, serveFrozen, servedBundleInPage, sessionBundleProblem, sourceKind, writeLaneBundle } from './laneBundle.mts';

function slot(dir: string, sha: string, body = 'console.log(1)') {
  mkdirSync(resolve(dir, 'dist'), { recursive: true });
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify({ display_name: 'x' }));
  writeFileSync(resolve(dir, 'dist', 'manifest.json'), JSON.stringify({ kind: 'build-manifest', bundle: { sha256: sha } }));
  writeFileSync(resolve(dir, 'dist', 'index.js'), body);
  return dir;
}

test('vast b1: the frozen copy outlives a later stage into the slot it was copied from', () => {
  const staged = slot(testTempDirSync('so-staged-'), 'aaaa1111aaaa1111ffff');
  const laneRoot = testTempDirSync('so-lane-root-');
  const record = copyBundle({ source: staged, laneRoot, now: () => new Date('2026-11-01T00:00:00Z') });
  assert.equal(record.sha256, 'aaaa1111aaaa1111ffff');
  assert.equal(record.kind, 'slot');
  assert.equal(record.dir, resolve(laneRoot, 'bundle', 'aaaa1111aaaa1111'));
  slot(staged, 'bbbb2222', 'console.log(2)');
  assert.equal(bundleSha(record.dir), 'aaaa1111aaaa1111ffff');
  assert.equal(readFileSync(resolve(record.dir, 'dist', 'index.js'), 'utf-8'), 'console.log(1)');
  writeLaneBundle(laneRoot, { ...record, pid: 42 });
  assert.equal(readLaneBundle(laneRoot)?.pid, 42);
  assert.equal(existsSync(`${record.dir}.copying`), false);
});

test('copying refuses a source with no build; a checkout is recognised by its release allowlist', () => {
  assert.throws(() => copyBundle({ source: testTempDirSync('so-empty-'), laneRoot: testTempDirSync('so-lane-root-') }), /no dist\/manifest\.json/);
  const checkout = slot(testTempDirSync('so-checkout-'), 'c');
  writeFileSync(resolve(checkout, 'package.json'), '{}');
  mkdirSync(resolve(checkout, 'scripts', 'release'), { recursive: true });
  writeFileSync(resolve(checkout, 'scripts', 'release', 'artifact-allowlist.json'), '{}');
  assert.equal(sourceKind(checkout), 'checkout');
  assert.equal(sourceKind(slot(testTempDirSync('so-slot-'), 's')), 'slot');
});

test('the route answers extension URLs from the frozen copy and refuses paths that leave it', async () => {
  const dir = slot(testTempDirSync('so-frozen-'), 'f');
  const base = 'http://127.0.0.1:8146/scripts/extensions/third-party/story-orchestrator/';
  assert.equal(frozenFileFor(dir, `${base}dist/index.js?v=1`)?.file, resolve(dir, 'dist', 'index.js'));
  assert.equal(frozenFileFor(dir, `${base}dist/index.js`)?.contentType, 'application/javascript');
  assert.equal(frozenFileFor(dir, `${base}../../../secrets.json`), null);
  assert.equal(frozenFileFor(dir, `${base}dist/%2e%2e/%2e%2e/x`), null);
  assert.equal(frozenFileFor(dir, 'http://127.0.0.1:8146/script.js'), null);
  const calls: any[] = [];
  const route = { fulfill: async (options: any) => { calls.push(options); } };
  assert.equal(await serveFrozen(route, dir, `${base}dist/index.js`), 'served');
  assert.equal(String(calls[0].body), 'console.log(1)');
  assert.equal(calls[0].headers['cache-control'], 'no-store');
  assert.equal(await serveFrozen(route, dir, `${base}dist/123.chunk.js`), 'missing');
  assert.equal(calls[1].status, 404);
});

test('the page check reads the manifest through the page, so a live route counts', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => ({ ok: true, status: 200, json: async () => ({ bundle: { sha256: url.endsWith('dist/manifest.json') ? 'routed' : 'x' } }) })) as any;
  try {
    assert.deepEqual(await servedBundleInPage({ evaluate: async (fn: any, arg: any) => fn(arg) }), { sha256: 'routed', http: 200 });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a row whose bundle moved, or that started off the frozen one, is named', () => {
  assert.deepEqual(rowBundleProblems({ frozen: 'aaaa1111', start: 'aaaa1111', end: 'aaaa1111' }), []);
  assert.deepEqual(rowBundleProblems({ frozen: null, start: 'aaaa1111', end: 'aaaa1111' }), []);
  assert.match(rowBundleProblems({ frozen: null, start: 'aaaa1111', end: 'bbbb2222' }).join(), /changed during the row: aaaa1111 -> bbbb2222/);
  assert.match(rowBundleProblems({ frozen: 'aaaa1111', start: 'bbbb2222', end: 'bbbb2222' }).join(), /batch froze aaaa1111/);
  assert.match(rowBundleProblems({ frozen: null, start: null, end: null }).join(), /could not be read/);
});

test('a session turn is refused when the lane page is no longer served the session bundle', () => {
  assert.equal(sessionBundleProblem(null, 'x'), null);
  assert.equal(sessionBundleProblem('aaaa1111', 'aaaa1111'), null);
  assert.match(String(sessionBundleProblem('aaaa1111', 'bbbb2222')), /not played/);
});

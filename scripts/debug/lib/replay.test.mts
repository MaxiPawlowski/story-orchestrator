import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { BATCH_FORMAT, FILES as BATCH_FILES, sha256 as batchSha, writeManifest, type BatchManifest } from './promptBatch.mts';
import { beginSession, endSession, laneReplayUrl, markStep, replayRowVerdict, replayStatus, sessionStats } from './replayClient.mts';
import { importBatch } from './replayImport.mts';
import { ReplayServer, routePath } from './replayServer.mts';
import { canonicalBody, changedKeys, driftReport, firstDiff, lookup, ReplaySession, ReplayStore, requestKey, requestKind, type ReplayIdentity } from './replayStore.mts';
import { testTempDir } from '../../lib/testTemp.mjs';

const IDENTITY: ReplayIdentity = { model: 'artemis-31b', build: 'b11888-patched', ctx: 32768, upstream: 'http://127.0.0.1:1', origin: 'lane' };
const tempDir = () => testTempDir('so-replay-');
const body = (prompt: string, extra: Record<string, unknown> = {}) => JSON.stringify({ prompt, api_type: 'llamacpp', api_server: 'http://127.0.0.1:18078/lane/41', n_predict: 64, temperature: 0.8, ...extra });

test('the key is exact over the body, ignores key order and the routing-only api_server, and moves with any model input', () => {
  const a = requestKey({ method: 'POST', path: '/completion', body: body('hello') });
  const reordered = JSON.stringify({ temperature: 0.8, n_predict: 64, api_server: 'http://127.0.0.1:18888', api_type: 'llamacpp', prompt: 'hello' });
  assert.equal(requestKey({ method: 'post', path: '/completion', body: reordered }), a);
  assert.notEqual(requestKey({ method: 'POST', path: '/completion', body: body('hello ') }), a);
  assert.notEqual(requestKey({ method: 'POST', path: '/completion', body: body('hello', { temperature: 0.7 }) }), a);
  assert.notEqual(requestKey({ method: 'POST', path: '/v1/completions', body: body('hello') }), a);
  assert.equal(canonicalBody('not json'), 'not json');
  const stamped = (stamp: string) => requestKey({ method: 'POST', path: '/completion', body: body(`chat ${stamp}`) }, { keyIgnored: ['api_server'], normalise: { set: 'st-stamps', rules: [{ id: 'st', source: '\\d{4}-\\d{1,2}-\\d{1,2}@\\d+h\\d+m\\d+s', flags: 'g', replace: '<s>' }] } });
  assert.equal(stamped('2026-10-26@12h01m02s'), stamped('2026-10-27@09h11m12s'));
  assert.equal(requestKind('POST', '/completion'), 'generation');
  assert.equal(requestKind('POST', '/tokenize'), 'static');
  assert.equal(requestKind('GET', '/props'), 'static');
});

test('firstDiff and changedKeys name where a moved request differs', () => {
  assert.equal(firstDiff('same', 'same'), null);
  assert.deepEqual(firstDiff('abcdef', 'abcXef', 2), { offset: 3, was: 'bcde', now: 'bcXe' });
  assert.deepEqual(changedKeys(body('a'), body('b', { api_server: 'x' })), ['prompt']);
});

async function seededStore(entries: Array<{ prompt: string; row: string; reply: string; path?: string; method?: string }>) {
  const store = await ReplayStore.create(await tempDir(), IDENTITY);
  for (const [index, entry] of entries.entries()) {
    const request = { method: entry.method ?? 'POST', path: entry.path ?? '/completion', body: entry.method === 'GET' ? '' : body(entry.prompt) };
    await store.append({ key: store.key(request), method: request.method, path: request.path, kind: requestKind(request.method, request.path), row: entry.row, step: null, ordinal: index + 1, promptSha: null, sampler: {}, stream: false, status: 200, contentType: 'application/json', aborted: false, ms: 1, at: 'now', build: null, source: 'lane' }, { request: request.body, response: { body: entry.reply } });
  }
  return store;
}

test('a generation key replays its n-th recording on its n-th occurrence (own row first); a static key reuses the latest', async () => {
  const store = await seededStore([
    { prompt: 'p', row: 'other', reply: 'o1' }, { prompt: 'p', row: 'mine', reply: 'm1' }, { prompt: 'p', row: 'mine', reply: 'm2' },
    { prompt: '', row: 'mine', reply: 'props1', method: 'GET', path: '/props' }, { prompt: '', row: 'mine', reply: 'props2', method: 'GET', path: '/props' },
  ]);
  const session = new ReplaySession('lane-1', store, 'replay', 'mine');
  const request = { method: 'POST', path: '/completion', body: body('p') };
  const replies = [];
  for (let i = 0; i < 4; i += 1) {
    const found = lookup(store, session, request);
    replies.push('hit' in found ? (await store.body(found.hit)).response.body : `miss:${found.miss}:${found.recorded}`);
  }
  assert.deepEqual(replies, ['m1', 'm2', 'o1', 'miss:exhausted:3']);
  const props = { method: 'GET', path: '/props', body: '' };
  for (let i = 0; i < 3; i += 1) {
    const found = lookup(store, session, props);
    assert.ok('hit' in found);
    assert.equal((await store.body(found.hit)).response.body, 'props2');
  }
  assert.deepEqual(lookup(store, session, { method: 'POST', path: '/completion', body: body('never') }), { miss: 'unrecorded', recorded: 0 });
});

test('a store holds one model and build: reopening it for another identity is refused', async () => {
  const dir = await tempDir();
  await ReplayStore.create(dir, IDENTITY);
  await ReplayStore.openOrCreate(dir, { ...IDENTITY, upstream: 'elsewhere' });
  await assert.rejects(ReplayStore.openOrCreate(dir, { ...IDENTITY, build: 'b11388' }), /one model and build/);
  await assert.rejects(ReplayStore.openOrCreate(dir, IDENTITY, 'st-stamps'), /normalise set/);
});

test('routePath maps /lane/<n>/... to the lane session and keeps other paths on the default session', () => {
  assert.deepEqual(routePath('/lane/41/completion'), { session: 'lane-41', path: '/completion' });
  assert.deepEqual(routePath('/lane/41'), { session: 'lane-41', path: '/' });
  assert.deepEqual(routePath('/props?x=1'), { session: 'default', path: '/props' });
});

interface Upstream { server: Server; url: string; calls: string[] }

async function fakeUpstream(): Promise<Upstream> {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      calls.push(`${req.method} ${req.url}`);
      if (req.url === '/props') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ model_alias: 'artemis-31b', build_info: 'b11888-patched', default_generation_settings: { n_ctx: 32768 } })); return; }
      const parsed = JSON.parse(raw || '{}');
      if (parsed.prompt === 'boom') { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"x"}'); return; }
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const parts = parsed.prompt === 'long' ? 40 : 3;
        for (let i = 0; i < parts; i += 1) {
          if (res.destroyed) return;
          res.write(`data: ${JSON.stringify({ content: `t${i} `, stop: false })}\n\n`);
          await new Promise((done) => setTimeout(done, 15));
        }
        res.end(`data: ${JSON.stringify({ content: '', stop: true })}\n\n`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: `reply to ${parsed.prompt} #${calls.length}`, model: 'artemis-31b' }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`, calls };
}

const close = (server: Server) => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); });

async function startReplay(store: ReplayStore, mode: 'replay' | 'record' | 'mixed', upstream: string | null, extra: Partial<ConstructorParameters<typeof ReplayServer>[0]> = {}) {
  const server = new ReplayServer({ store, mode, upstream, pace: 0, ...extra });
  const port = await server.listen(0);
  return { server, base: `http://127.0.0.1:${port}` };
}

const post = (url: string, payload: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });

test('record then replay: a lane row is reproduced byte for byte without the upstream, per-step counts and a refused miss with its drift', async () => {
  const upstream = await fakeUpstream();
  const dir = await tempDir();
  const recordStore = await ReplayStore.create(dir, IDENTITY);
  const recorder = await startReplay(recordStore, 'record', upstream.url);
  const target = { url: recorder.base, session: 'lane-41' };
  await beginSession(target, 'GS1#1', 'bundle-a');
  await markStep(target, 'GS1.1 3:send_generate');
  const laneUrl = laneReplayUrl(41, recorder.base);
  const recorded = await (await post(`${laneUrl}/completion`, body('hello'))).text();
  const swipe = await (await post(`${laneUrl}/completion`, body('hello'))).text();
  const streamed = await (await post(`${laneUrl}/completion`, body('stream me', { stream: true }))).text();
  const props = await (await fetch(`${laneUrl}/props`)).text();
  await fetch(`${laneUrl}/props`);
  const recordStats = await endSession(target);
  assert.equal(recordStats.recorded, 4);
  assert.equal(recordStats.live, 5);
  assert.equal(recordStats.steps['GS1.1 3:send_generate'].live, 5);
  assert.notEqual(recorded, swipe);
  await recorder.server.close();
  await close(upstream.server);

  const store = await ReplayStore.open(dir);
  assert.equal(store.entries.length, 4);
  assert.deepEqual(store.entries.map((entry) => [entry.row, entry.step, entry.kind, entry.stream, entry.build]), [
    ['GS1#1', 'GS1.1 3:send_generate', 'generation', false, 'bundle-a'], ['GS1#1', 'GS1.1 3:send_generate', 'generation', false, 'bundle-a'],
    ['GS1#1', 'GS1.1 3:send_generate', 'generation', true, 'bundle-a'], ['GS1#1', 'GS1.1 3:send_generate', 'static', false, 'bundle-a'],
  ]);
  assert.equal(store.entries[0].sampler.temperature, 0.8);
  const replay = await startReplay(store, 'replay', null);
  const replayTarget = { url: replay.base, session: 'lane-7' };
  await beginSession(replayTarget, 'GS1#1', 'bundle-b');
  await markStep(replayTarget, 'GS1.1 3:send_generate');
  const lane7 = laneReplayUrl(7, replay.base);
  assert.equal(await (await post(`${lane7}/completion`, body('hello', { api_server: 'http://127.0.0.1:18078/lane/7' }))).text(), recorded);
  assert.equal(await (await post(`${lane7}/completion`, body('hello'))).text(), swipe);
  const replayedStream = await post(`${lane7}/completion`, body('stream me', { stream: true }));
  assert.equal(replayedStream.headers.get('content-type'), 'text/event-stream');
  assert.equal(await replayedStream.text(), streamed);
  assert.equal(await (await fetch(`${lane7}/props`)).text(), props);
  await markStep(replayTarget, 'GS1.2 1:send_generate');
  const refused = await post(`${lane7}/completion`, body('hello there'));
  assert.equal(refused.status, 503);
  assert.match((await refused.json()).error, /never invents/);
  const exhausted = await post(`${lane7}/completion`, body('hello'));
  assert.equal(exhausted.status, 503);
  const stats = await sessionStats(replayTarget);
  assert.ok(stats);
  assert.equal(stats.replayed, 3);
  assert.equal(stats.static, 1);
  assert.equal(stats.refused, 2);
  assert.equal(stats.live, 0);
  assert.deepEqual(stats.steps['GS1.2 1:send_generate'], { replayed: 0, static: 0, live: 0, refused: 2 });
  const [moved, overused] = stats.misses;
  assert.equal(moved.reason, 'unrecorded');
  assert.equal(moved.step, 'GS1.2 1:send_generate');
  assert.deepEqual(moved.nearest?.changedKeys, ['prompt']);
  assert.equal(moved.nearest?.prompt?.offset, 5);
  assert.equal(overused.reason, 'exhausted');
  assert.equal(overused.recorded, 2);
  const verdict = replayRowVerdict(stats, 'replay');
  assert.equal(verdict.problems.length, 1);
  assert.match(verdict.problems[0], /2 request\(s\) had no recording/);
  const drift = driftReport([stats]);
  assert.deepEqual(drift.map((row) => [row.step, row.misses, row.reasons]), [['GS1.2 1:send_generate', 2, ['unrecorded', 'exhausted']]]);
  const status = await replayStatus(replay.base);
  assert.equal(status?.mode, 'replay');
  assert.equal(status?.entries, 4);
  await replay.server.close();
});

test('a stream the client stopped is recorded as aborted and replayed up to the stop, then held open until the client leaves', async () => {
  const upstream = await fakeUpstream();
  const dir = await tempDir();
  const recorder = await startReplay(await ReplayStore.create(dir, IDENTITY), 'record', upstream.url);
  const controller = new AbortController();
  const response = await fetch(`${recorder.base}/lane/3/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('long', { stream: true }), signal: controller.signal });
  const reader = response.body!.getReader();
  await reader.read();
  controller.abort();
  await new Promise((done) => setTimeout(done, 150));
  await recorder.server.close();
  await close(upstream.server);
  const store = await ReplayStore.open(dir);
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].aborted, true);
  const replay = await startReplay(store, 'replay', null, { abortedHoldMs: 200 });
  const began = Date.now();
  const text = await (await post(`${replay.base}/lane/3/completion`, body('long', { stream: true }))).text();
  assert.ok(Date.now() - began >= 150);
  assert.ok(text.startsWith('data: '));
  assert.ok(!text.includes('"stop":true'));
  await replay.server.close();
});

test('mixed replays what is recorded and records the rest live; record needs an upstream', async () => {
  const upstream = await fakeUpstream();
  const store = await seededStore([{ prompt: 'known', row: 'r', reply: 'recorded answer' }]);
  const mixed = await startReplay(store, 'mixed', upstream.url);
  const target = { url: mixed.base, session: 'lane-2' };
  await beginSession(target, 'r', null);
  assert.equal(await (await post(`${mixed.base}/lane/2/completion`, body('known'))).text(), 'recorded answer');
  assert.match(await (await post(`${mixed.base}/lane/2/completion`, body('fresh'))).text(), /reply to fresh/);
  const stats = await endSession(target);
  assert.deepEqual([stats.replayed, stats.live, stats.recorded, stats.refused], [1, 1, 1, 0]);
  assert.equal(upstream.calls.filter((call) => call.startsWith('POST')).length, 1);
  assert.equal(store.entries.length, 2);
  assert.equal(replayRowVerdict(stats, 'mixed').problems.length, 0);
  assert.match(replayRowVerdict(stats, 'replay').problems.join(' '), /mixed mode/);
  assert.match(replayRowVerdict(null, 'replay').problems[0], /could not be read/);
  await mixed.server.close();
  await close(upstream.server);
  assert.throws(() => new ReplayServer({ store, mode: 'record' }), /needs an upstream/);
});

test('an upstream error answer is passed through and recorded with its status, so a replay reproduces it', async () => {
  const upstream = await fakeUpstream();
  const store = await ReplayStore.create(await tempDir(), IDENTITY);
  const recorder = await startReplay(store, 'record', upstream.url);
  const response = await post(`${recorder.base}/completion`, body('boom'));
  assert.equal(response.status, 500);
  await response.text();
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].status, 500);
  await recorder.server.close();
  await close(upstream.server);
});

test('import-batch keys class-M answers by their frozen bodies, so a lane request with the same prompt replays them', async () => {
  const batch = await tempDir();
  const frozen = body('read this scene', { api_server: 'http://127.0.0.1:8133' });
  const sha = batchSha(frozen);
  const manifest: BatchManifest = {
    format: BATCH_FORMAT, measurement: 't8', createdAt: 'now', synthetic: true, source: { stUrl: null, bundleSha256: 'bundle-x' },
    route: { profileId: null, name: 'Memory', api: 'llamacpp', apiUrl: null, preset: null, instructName: null, instruct: null }, args: {},
    items: [{ id: 'tw1', sha, path: '/completion', calls: 1, builderInBody: true, selfCheck: { ok: true }, inPage: null, meta: {} }, { id: 'tw2', sha: null, path: null, calls: 0, builderInBody: null, selfCheck: null, inPage: null, meta: {}, problem: 'x' }],
    tokenizer: { calls: 0, failed: 0 }, problems: [],
  };
  await writeManifest(batch, manifest, new Map([[sha, frozen]]));
  await appendFile(join(batch, BATCH_FILES.responses), `${JSON.stringify({ itemId: 'tw1', sha, ok: true, attempt: 1, status: 200, raw: '{"content":"SCENE_NONE","model":"artemis-31b"}', finish: 'stop', tokens: { prompt: 1, predicted: 1 }, ms: 10, at: 'now' })}\n`);
  const dir = await tempDir();
  const result = await importBatch(batch, join(dir, 'store'));
  assert.deepEqual([result.imported, result.skipped, result.already, result.identity.model, result.identity.origin], [1, 1, 0, 'artemis-31b', 'prompt-batch']);
  assert.equal((await importBatch(batch, join(dir, 'store'))).already, 1);
  const store = await ReplayStore.open(join(dir, 'store'));
  const session = new ReplaySession('lane-9', store, 'replay', 'GS6#1');
  const found = lookup(store, session, { method: 'POST', path: '/completion', body: body('read this scene', { api_server: 'http://127.0.0.1:18078/lane/9' }) });
  assert.ok('hit' in found);
  assert.equal((await store.body(found.hit)).response.body, '{"content":"SCENE_NONE","model":"artemis-31b"}');
  const lane = await ReplayStore.openOrCreate(join(dir, 'lane-store'), IDENTITY);
  assert.equal(lane.entries.length, 0);
  await assert.rejects(importBatch(batch, join(dir, 'lane-store')), /one model and build/);
});

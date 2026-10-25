import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BATCH_FORMAT, backendTokens, bodyFile, diffShas, FILES, freezeRequest, readResponses, sendBatch, sha256, writeManifest,
  type BatchItem, type BatchManifest, type Finish,
} from './promptBatch.mts';
import { installRecorder, runPageItem } from './promptBatchRecorder.mts';

const GENERATE = 'http://127.0.0.1:8131/api/backends/text-completions/generate';
const finishOf = (json: unknown): Finish => ((json as { stop_type?: string }).stop_type === 'limit' ? 'length' : 'stop');

test('freezeRequest keeps the llama.cpp body as ST forwards it, with ST\'s localhost rewrite', () => {
  const body = JSON.stringify({ prompt: 'p', api_type: 'llamacpp', api_server: 'http://localhost:18888', n_predict: 512, stream: false });
  const frozen = freezeRequest({ url: GENERATE, body });
  assert.equal(frozen.path, '/completion');
  assert.equal(JSON.parse(frozen.body).api_server, 'http://127.0.0.1:18888');
  assert.equal(frozen.sha, sha256(frozen.body));
  const untouched = JSON.stringify({ prompt: 'p', api_type: 'tabby', api_server: 'http://127.0.0.1:5000', stream: false });
  assert.deepEqual(freezeRequest({ url: GENERATE, body: untouched }), { path: '/v1/completions', body: untouched, sha: sha256(untouched), apiType: 'tabby' });
});

test('freezeRequest refuses routes ST rewrites server-side, and streams', () => {
  assert.throws(() => freezeRequest({ url: 'http://x/api/backends/chat-completions/generate', body: '{}' }), /not a text-completion request/);
  assert.throws(() => freezeRequest({ url: GENERATE, body: JSON.stringify({ api_type: 'vllm' }) }), /rewritten by ST/);
  assert.throws(() => freezeRequest({ url: GENERATE, body: JSON.stringify({ api_type: 'llamacpp', stream: true }) }), /streaming/);
});

test('backendTokens reads llama.cpp, timings and OpenAI usage shapes', () => {
  assert.deepEqual(backendTokens({ tokens_evaluated: 900, tokens_predicted: 40 }), { prompt: 900, predicted: 40 });
  assert.deepEqual(backendTokens({ timings: { prompt_n: 12, predicted_n: 3 } }), { prompt: 12, predicted: 3 });
  assert.deepEqual(backendTokens({ usage: { prompt_tokens: 5, completion_tokens: 6 }, tokens_evaluated: 1 }), { prompt: 5, predicted: 6 });
  assert.deepEqual(backendTokens(null), { prompt: null, predicted: null });
});

test('diffShas names moved, added and removed items', () => {
  const item = (id: string, sha: string | null) => ({ id, sha }) as BatchItem;
  const diff = diffShas({ items: [item('a', '1'), item('b', '2'), item('c', '3')] }, { items: [item('a', '1'), item('b', '9'), item('d', '4')] });
  assert.deepEqual(diff, { same: ['a'], changed: [{ id: 'b', was: '2', now: '9' }], added: ['d'], removed: ['c'] });
});

async function batchDir(bodies: string[], extra: Partial<BatchItem>[] = []) {
  const dir = await mkdtemp(join(tmpdir(), 'so-prompt-batch-'));
  const map = new Map<string, string>();
  const items: BatchItem[] = bodies.map((body, index) => {
    const sha = sha256(body);
    map.set(sha, body);
    return { id: `item${index}`, sha, path: '/completion', calls: 1, builderInBody: true, selfCheck: { ok: true }, inPage: null, meta: {}, ...(extra[index] ?? {}) };
  });
  const manifest: BatchManifest = {
    format: BATCH_FORMAT, measurement: 't8', createdAt: 'now', synthetic: true, source: { stUrl: null, bundleSha256: null },
    route: { profileId: null, name: null, api: 'llamacpp', apiUrl: null, preset: null, instructName: null, instruct: null }, args: {}, items, tokenizer: { calls: 0, failed: 0 }, problems: [],
  };
  await writeManifest(dir, manifest, map);
  return { dir, items };
}

type Handler = (body: string, request: IncomingMessage, response: ServerResponse) => void;

async function fakeBackend(handler: Handler) {
  const seen: Array<{ url: string; body: string }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      seen.push({ url: request.url ?? '', body });
      handler(body, request, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return { base: `http://127.0.0.1:${address.port}`, seen, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const answer = (content: string, extra: Record<string, unknown> = {}): Handler => (_body, _request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ content, stop_type: 'eos', tokens_evaluated: 100, tokens_predicted: 7, ...extra }));
};

test('send posts every frozen body byte for byte, records the answer, and resumes without resending', async () => {
  const bodies = [JSON.stringify({ prompt: 'one é', api_type: 'llamacpp' }), JSON.stringify({ prompt: 'two', api_type: 'llamacpp' })];
  const { dir, items } = await batchDir(bodies);
  const backend = await fakeBackend(answer('NO_DELTA'));
  try {
    const first = await sendBatch({ dir, baseUrl: backend.base, finishOf, limit: 1 });
    assert.equal(first.ok, 1);
    const second = await sendBatch({ dir, baseUrl: `${backend.base}/`, finishOf });
    assert.deepEqual({ ok: second.ok, skipped: second.skipped, sent: second.sent }, { ok: 1, skipped: 1, sent: 1 });
    assert.deepEqual(backend.seen.map((entry) => entry.url), ['/completion', '/completion']);
    assert.deepEqual(backend.seen.map((entry) => sha256(entry.body)), items.map((item) => item.sha));
    const records = await readResponses(dir);
    assert.deepEqual(records.map((record) => [record.itemId, record.ok, record.finish, record.tokens.prompt, record.tokens.predicted]), [['item0', true, 'stop', 100, 7], ['item1', true, 'stop', 100, 7]]);
    assert.equal(JSON.parse(records[0].raw).content, 'NO_DELTA');
  } finally {
    await backend.close();
  }
});

test('send retries a failed request once, then stops the row as S5 and never resumes it', async () => {
  const { dir } = await batchDir([JSON.stringify({ prompt: 'a', api_type: 'llamacpp' }), JSON.stringify({ prompt: 'b', api_type: 'llamacpp' })]);
  const backend = await fakeBackend((_body, _request, response) => {
    response.writeHead(500, { 'content-type': 'text/plain' });
    response.end('boom');
  });
  try {
    const result = await sendBatch({ dir, baseUrl: backend.base, finishOf });
    assert.equal(backend.seen.length, 2);
    assert.equal(result.stopped?.stopped, 'S5');
    assert.equal(result.stopped?.verdict, 'NOT A MEASUREMENT');
    assert.equal(result.stopped?.at, '1/2');
    assert.deepEqual((await readResponses(dir)).map((record) => [record.attempt, record.ok, record.status]), [[1, false, 500], [2, false, 500]]);
    await assert.rejects(sendBatch({ dir, baseUrl: backend.base, finishOf }), /never resumed/);
  } finally {
    await backend.close();
  }
});

test('send treats an unreachable backend as plumbing, not a result', async () => {
  const { dir } = await batchDir([JSON.stringify({ prompt: 'a', api_type: 'llamacpp' })]);
  const backend = await fakeBackend(answer('x'));
  await backend.close();
  const result = await sendBatch({ dir, baseUrl: backend.base, finishOf, timeoutMs: 2000 });
  assert.equal(result.stopped?.stopped, 'S5');
  assert.equal((await readResponses(dir)).length, 2);
});

test('send hands every answered item to the stop callback and halts on its decision', async () => {
  const bodies = ['a', 'b', 'c', 'd'].map((prompt) => JSON.stringify({ prompt, api_type: 'llamacpp' }));
  const { dir } = await batchDir(bodies);
  const backend = await fakeBackend(answer('NO_DELTA'));
  const progress: Array<[number, number, boolean | null, number]> = [];
  try {
    const result = await sendBatch({
      dir, baseUrl: backend.base, finishOf,
      outcome: (item) => item.id !== 'item0',
      stop: ({ index, total, outcome, records }) => {
        progress.push([index, total, outcome, records.length]);
        return index === 1 ? { stop: true, rule: 'S1', verdict: 'FAIL', detail: 'misses exceed the floor' } : null;
      },
    });
    assert.deepEqual(progress, [[0, 4, false, 1], [1, 4, true, 2]]);
    assert.deepEqual(result.stopped, { stopped: 'S1', verdict: 'FAIL', at: '2/4', counts: { sent: 2, ok: 2, failed: 0, planned: 4 }, detail: 'misses exceed the floor' });
    assert.deepEqual(JSON.parse(await readFile(join(dir, FILES.stop), 'utf-8')).stopped, 'S1');
    assert.equal(backend.seen.length, 2);
  } finally {
    await backend.close();
  }
});

test('send skips items without a frozen body or with a capture problem, and refuses an edited body', async () => {
  const bodies = [JSON.stringify({ prompt: 'a', api_type: 'llamacpp' }), JSON.stringify({ prompt: 'b', api_type: 'llamacpp' })];
  const { dir, items } = await batchDir(bodies, [{}, { problem: 'self-check: differs' }]);
  const backend = await fakeBackend(answer('NO_DELTA'));
  try {
    const result = await sendBatch({ dir, baseUrl: backend.base, finishOf });
    assert.deepEqual({ planned: result.planned, unsendable: result.unsendable, sent: result.sent }, { planned: 1, unsendable: 1, sent: 1 });
    const fresh = await batchDir([JSON.stringify({ prompt: 'c', api_type: 'llamacpp' })]);
    await writeFile(bodyFile(fresh.dir, fresh.items[0].sha as string), '{"prompt":"edited"}', 'utf-8');
    await assert.rejects(sendBatch({ dir: fresh.dir, baseUrl: backend.base, finishOf }), /no longer hashes/);
    assert.equal(items.length, 2);
  } finally {
    await backend.close();
  }
});

test('the page recorder answers the text-completion call with the canned reply and refuses every other model route', async () => {
  const g = globalThis as any;
  const originalFetch = g.fetch;
  const passed: string[] = [];
  g.fetch = async (input: string) => {
    passed.push(String(input));
    return new Response('{"count":3}', { status: 200 });
  };
  g.__soPromptBatch = undefined;
  g.storyOrchestratorLiveSuite = {
    runFixture: async (spec: { prompt: string }) => {
      await fetch('/api/tokenizers/llama3/encode', { method: 'POST', body: '{}' });
      const response = await fetch('/api/backends/text-completions/generate', { method: 'POST', body: JSON.stringify({ prompt: `<|turn>user\n${spec.prompt}`, api_type: 'llamacpp' }) });
      const json = await response.json();
      return { prompt: spec.prompt, rawResponse: json.content, deltas: [], facts: [], rejected: [], memory: [], arcs: [], epistemic: [], ledger: [] };
    },
    runWitnessRead: async () => {
      await fetch('/api/backends/chat-completions/generate', { method: 'POST', body: '{"messages":[]}' });
      return {};
    },
  };
  const page = { evaluate: (fn: (arg: unknown) => unknown, arg?: unknown) => Promise.resolve(fn(arg)) } as any;
  try {
    await installRecorder(page);
    await installRecorder(page);
    const run = await runPageItem(page, { kind: 'fixture', spec: { prompt: 'READ' }, canned: '{"content":"NO_DELTA"}' });
    assert.equal(run.ok, true);
    assert.equal(run.result?.rawResponse, 'NO_DELTA');
    assert.equal(run.calls.length, 1);
    assert.equal(JSON.parse(run.calls[0].body).prompt, '<|turn>user\nREAD');
    assert.deepEqual(run.tokenizer, [{ url: '/api/tokenizers/llama3/encode', status: 200 }]);
    assert.deepEqual(passed, ['/api/tokenizers/llama3/encode']);
    const refused = await runPageItem(page, { kind: 'witness', spec: {}, canned: '{}' });
    assert.equal(refused.ok, false);
    assert.match(refused.error ?? '', /refused model call/);
    assert.equal(refused.refused[0].url, '/api/backends/chat-completions/generate');
    await fetch('/api/backends/text-completions/generate', { method: 'POST', body: '{}' });
    assert.equal(passed.at(-1), '/api/backends/text-completions/generate');
  } finally {
    g.fetch = originalFetch;
    delete g.storyOrchestratorLiveSuite;
    delete g.__soPromptBatch;
  }
});

test('writeManifest refuses a body stored under the wrong sha', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-prompt-batch-'));
  const manifest = { format: BATCH_FORMAT, items: [] } as unknown as BatchManifest;
  await assert.rejects(writeManifest(dir, manifest, new Map([['0'.repeat(64), '{}']])), /does not hash/);
  assert.equal(existsSync(join(dir, FILES.manifest)), false);
});

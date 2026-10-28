import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPool, loadE0 } from './lib/e0.mts';
import { createStVectorsProvider, embeddingModelOf, insertSummary, type VectorPost } from './lib/e0StVectors.mts';
import { ChoiceRunRefused, choiceSummary, recordChoices, type ChoiceKit, type JudgeAnswer } from './lib/e0Choices.mts';
import { askClaude, askSol, opencodeText, type Exec } from './lib/e0LabelRun.mts';
import { checkLabels, mergeLabels, selectSessions, writeLabels } from './lib/e0Label.mts';
import { testTempDir } from '../lib/testTemp.mjs';

const fakeVectors = () => {
  const stores = new Map<string, Array<{ hash: number; text: string }>>();
  const log: string[] = [];
  const post: VectorPost = async (path, body) => {
    log.push(path);
    const id = String(body.collectionId);
    if (path.endsWith('/purge')) stores.delete(id);
    if (path.endsWith('/insert')) stores.set(id, body.items as Array<{ hash: number; text: string }>);
    if (path.endsWith('/list')) return { status: 200, json: (stores.get(id) ?? []).map((item) => item.hash), ms: 1 };
    if (!path.endsWith('/query')) return { status: 200, json: null, ms: 5 };
    const items = [...(stores.get(id) ?? [])].sort((left, right) => right.hash - left.hash).slice(0, Number(body.topK));
    const threshold = Number(body.threshold);
    const metadata = items.filter((item) => (threshold >= 0.7 ? item.hash % 4 === 0 : true)).map((item) => ({ hash: item.hash, text: item.text }));
    return { status: 200, json: { hashes: items.map((item) => item.hash), metadata }, ms: 12.5 };
  };
  return { post, log, stores };
};

test('st-vectors provider: one purge + insert per collection, hash offset round trip, pool from hashes, bands from metadata, timed', async () => {
  const { post, log, stores } = fakeVectors();
  const provider = createStVectorsProvider({ post, model: 'Xenova/test' });
  assert.equal(provider.id, 'st-vectors:transformers:Xenova/test');
  const collection = Array.from({ length: 10 }, (_, id) => ({ id, text: `line ${id}` }));
  assert.deepEqual(await provider.query(collection, 'q', 8, 0), { ids: [9, 8, 7, 6, 5, 4, 3, 2], latencyMs: 12.5 });
  assert.deepEqual((await provider.query(collection, 'q', 8, 0.82)).ids, [7, 3]);
  assert.deepEqual(log, ['/api/vector/list', '/api/vector/purge', '/api/vector/insert', '/api/vector/query', '/api/vector/query']);
  assert.deepEqual(insertSummary(provider.inserts()), { reused: 0, collections: 1, items: 10, insertMsTotal: 5, insertMsP50: 5, insertMsP95: 5 });
  const resumed = createStVectorsProvider({ post, model: 'Xenova/test' });
  log.length = 0;
  assert.deepEqual((await resumed.query(collection, 'q', 8, 0)).ids, [9, 8, 7, 6, 5, 4, 3, 2]);
  assert.deepEqual(log, ['/api/vector/list', '/api/vector/query']);
  assert.deepEqual(insertSummary(resumed.inserts()), { reused: 1, collections: 0, items: 0, insertMsTotal: 0, insertMsP50: null, insertMsP95: null });
  const changed = createStVectorsProvider({ post, model: 'Xenova/test' });
  stores.set([...stores.keys()][0], stores.get([...stores.keys()][0])!.slice(0, 9));
  log.length = 0;
  await changed.query(collection, 'q', 8, 0);
  assert.deepEqual(log, ['/api/vector/list', '/api/vector/purge', '/api/vector/insert', '/api/vector/query']);
  assert.equal(await provider.purgeAll(), 1);
  assert.equal(stores.size, 0);
});

test('st-vectors provider: an HTTP failure stops the pool instead of scoring a hole', async () => {
  const provider = createStVectorsProvider({ post: async (path) => ({ status: path.endsWith('/insert') ? 500 : 200, json: null, ms: 1 }), model: 'm' });
  await assert.rejects(() => provider.query([{ id: 1, text: 'a' }], 'q', 8, 0), /insert .* HTTP 500/);
});

test('st-vectors pool: buildPool takes the provider and records latencies the stub never has', async () => {
  const work = await testTempDir('so-e0-stv-');
  await mkdir(join(work, 's1'));
  await writeFile(join(work, 's1', 'chat-1.json'), JSON.stringify(Array.from({ length: 30 }, (_, id) => ({ id, name: id % 2 ? 'A' : 'B', isUser: id % 2 === 0, text: `message ${id}` }))));
  await writeFile(join(work, 'labels.json'), JSON.stringify({ format: 'so-e0-labels/1', source: 'synthetic', questions: [{ id: 'q1', session: 's1', askMessageId: 20, asker: 'B', text: 'what did A say', gold: [3], review: null }] }));
  const { pool } = await buildPool(join(work, 'labels.json'), work, createStVectorsProvider({ post: fakeVectors().post, model: 'm' }));
  assert.equal(pool.provider, 'st-vectors:transformers:m');
  const [question] = pool.questions as Array<{ latencyMs?: { pool: number; bands: Record<string, number> } }>;
  assert.deepEqual(question.latencyMs, { pool: 12.5, bands: { '0.82': 12.5, '0.7': 12.5, '0.55': 12.5, '0.4': 12.5 } });
  await assert.rejects(() => buildPool(join(work, 'labels.json'), work, 'st-vectors' as 'stub'), /unknown here/);
});

test('embedding model is read from the ST copy config, unknown when absent', async () => {
  const work = await testTempDir('so-e0-cfg-');
  await writeFile(join(work, 'config.yaml'), 'extensions:\n  models:\n    embedding: Xenova/all-mpnet-base-v2\n');
  assert.equal(embeddingModelOf(work), 'Xenova/all-mpnet-base-v2');
  assert.equal(embeddingModelOf(join(work, 'missing')), 'unknown');
});

const question = { id: 'q1', query: 'what did A promise', candidates: [10, 20, 30, 40, 50, 60, 70, 80].map((messageId) => ({ messageId, text: `m${messageId}` })) };

const scriptedAsk = (picks: Array<string | null>, extra: Partial<JudgeAnswer> = {}) => {
  const seen: Array<string[]> = [];
  let index = 0;
  const ask = async (request: unknown) => {
    const options = Object.keys((request as { questions: { best: { criteria: Record<string, string> } } }).questions.best.criteria);
    seen.push(options);
    const choice = picks[index++] ?? null;
    return { answers: choice ? { best: { type: 'choice', choice, confidence: 0.9 } } : null, latencyMs: 300, usage: { input_tokens: 900 }, model: 'jev-1.13.0', cached: false, ...extra } as JudgeAnswer;
  };
  return { ask, seen };
};

test('arm d recorder: four calls, each pick removed from the next request, an unknown pick removes nothing', async () => {
  const kit = await loadE0() as unknown as ChoiceKit;
  const { ask, seen } = scriptedAsk(['m30', 'm99', 'm10', null]);
  const calls = await recordChoices([question], ask, kit);
  assert.deepEqual(calls.q1.map((call) => call.pick), [30, 99, 10, null]);
  assert.deepEqual(seen.map((options) => options.length), [8, 7, 7, 6]);
  assert.equal(seen[1].includes('m30'), false);
  assert.deepEqual(choiceSummary(calls), { questions: 1, calls: 4, fallbacks: 0, noPick: 1, missingTokens: 0, models: ['jev-1.13.0'], inputTokens: 3600 });
});

test('arm d recorder: a busy refusal waits and retries, a cache hit refuses, a finished question is not asked again', async () => {
  const kit = await loadE0() as unknown as ChoiceKit;
  const waits: number[] = [];
  let busy = 1;
  const ask = async () => (busy-- > 0 ? { answers: null, latencyMs: 0, fallback: 'busy' } : { answers: { best: { choice: 'm20' } }, latencyMs: 250, usage: { input_tokens: 800 } }) as JudgeAnswer;
  const calls = await recordChoices([question], ask, kit, { wait: async (ms) => { waits.push(ms); } });
  assert.deepEqual(waits, [61000]);
  assert.equal(calls.q1.length, 4);
  await assert.rejects(() => recordChoices([question], scriptedAsk(['m10'], { cached: true }).ask, kit), ChoiceRunRefused);
  let asked = 0;
  await recordChoices([question], async () => { asked += 1; return { answers: null, latencyMs: 1 }; }, kit, { done: calls });
  assert.equal(asked, 0);
});

const fakeExec = (stdout: string, code = 0) => {
  const runs: Array<{ command: string; args: string[]; env: Record<string, string> }> = [];
  const exec: Exec = async (command, args, _input, env) => { runs.push({ command, args, env }); return { code, stdout, stderr: '' }; };
  return { exec, runs };
};

test('label writers: Sol through opencode with tools off, Claude through claude -p with tools off; -fast and DeepSeek refused', async () => {
  const work = await testTempDir('so-e0-run-');
  const sol = fakeExec(`${JSON.stringify({ type: 'text', part: { text: '{"questions":[]}' } })}\n`);
  assert.deepEqual(await askSol('p', work, sol.exec), { text: '{"questions":[]}', model: 'openai/gpt-6.1-sol' });
  assert.deepEqual(sol.runs[0].args.slice(0, 2), ['run', '--standalone']);
  assert.match(sol.runs[0].env.OPENCODE_CONFIG_CONTENT, /"tools":\{"\*":false\}/);
  await assert.rejects(() => askSol('p', work, sol.exec, 'openai/gpt-6.1-sol-fast'), /refused/);
  await assert.rejects(() => askSol('p', work, sol.exec, 'deepseek/deepseek-chat'), /refused/);
  const claude = fakeExec(JSON.stringify({ result: '{"answers":{}}', modelUsage: { 'claude-x': {} } }));
  assert.deepEqual(await askClaude('p', work, claude.exec), { text: '{"answers":{}}', model: 'claude-x' });
  assert.equal(claude.runs[0].args[claude.runs[0].args.indexOf('--tools') + 1], '');
  await assert.rejects(() => askClaude('p', work, fakeExec('not json', 1).exec), /claude -p failed/);
  assert.equal(opencodeText('{"type":"step"}\n{"type":"text","part":{"text":"a"}}\n{"type":"text","part":{"text":"b"}}'), 'ab');
});

test('labels end to end: write, blind check, merge into a private set the review rule reads; reruns skip finished sessions', async () => {
  const root = await testTempDir('so-e0-labels-');
  const out = join(root, 'out');
  const rows = Array.from({ length: 50 }, (_, id) => ({ id, name: id % 3 === 0 ? 'Wren' : 'Tobin', isUser: id % 3 === 0, text: `tier line ${id} on the rope bridge ${id * 7}` }));
  await mkdir(join(root, 'T1', 'T1-1-1'), { recursive: true });
  await writeFile(join(root, 'T1', 'T1-1-1', 'chat-a.json'), JSON.stringify(rows));
  const { picked } = await selectSessions(root);
  assert.deepEqual(picked.kept, ['T1/T1-1-1']);
  let writes = 0;
  const writer = async () => { writes += 1; return { text: JSON.stringify({ questions: [{ askMessageId: 30, asker: 'Wren', text: 'What did Tobin call the bridge?', gold: [10] }, { askMessageId: 33, asker: 'Wren', text: 'What did Tobin vow?', gold: [13] }, { askMessageId: 31, asker: 'Wren', text: 'Bad turn?', gold: [4] }] }), model: 'sol-test' }; };
  const checker = async (prompt: string) => {
    assert.equal(prompt.includes('[10]') && !prompt.includes('[33]'), true);
    return { text: JSON.stringify({ answers: { q1: { answerable: true, ids: [10] }, q2: { answerable: true, ids: [14] }, q3: { answerable: true, ids: [4] } } }), model: 'claude-test' };
  };
  await writeLabels({ root, out, sessions: picked.kept, ask: writer, log: () => undefined });
  await writeLabels({ root, out, sessions: picked.kept, ask: writer, log: () => undefined });
  assert.equal(writes, 1);
  await checkLabels({ root, out, ask: checker, log: () => undefined });
  const merged = await mergeLabels({ root, out, writer: 'sol', checker: 'claude' });
  assert.deepEqual(merged.counts, { written: 3, invalid: 1, unchecked: 0, agreed: 1, disagreed: 1 });
  assert.deepEqual(merged.models, { writers: ['sol-test'], checkers: ['claude-test'] });
  const e0 = await loadE0();
  const read = e0.readE0Labels(merged.labels);
  assert.deepEqual(read.questions.map((entry) => entry.id), ['T1/T1-1-1#1']);
  assert.equal(read.dropped.disagreed, 1);
  assert.equal(JSON.parse(await readFile(join(out, 'written', 'T1__T1-1-1.json'), 'utf-8')).questions.length, 3);
});

test('E0 CLI golden: a frozen run becomes a public replay with no text that jest can replay to the same result', async () => {
  const work = await testTempDir('so-e0-golden-');
  const root = process.cwd();
  const labelsFile = join(root, 'test/fixtures/e0/synthetic/labels.json');
  const poolFile = join(root, 'test/measurements/v2.8/21-e0/synthetic.pool.json');
  const freezeFile = join(root, 'test/measurements/v2.8/21-e0/synthetic.freeze.json');
  const pool = JSON.parse(await readFile(poolFile, 'utf-8')) as { questions: Array<{ id: string; candidates: Array<{ messageId: number }> }> };
  const calls = Object.fromEntries(pool.questions.map((question) => [question.id, [0, 1, 2, 3].map((index) => ({ pick: question.candidates[index].messageId, latencyMs: 250, inputTokens: 600 }))]));
  await writeFile(join(work, 'calls.json'), JSON.stringify(calls));
  const { main } = await import('./so-e0.mts');
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(['golden', '--labels', labelsFile, '--pool', poolFile, '--freeze', freezeFile, '--choices', join(work, 'calls.json'), '--out', join(work, 'golden.json')]), 0);
  } finally {
    console.log = log;
  }
  const text = await readFile(join(work, 'golden.json'), 'utf-8');
  assert.doesNotMatch(text, /"text"|"query"|"messageId"|"source"/);
  const golden = JSON.parse(text);
  const e0 = await loadE0() as unknown as { replayE0Golden(golden: unknown): { arms: Array<{ arm: string; metrics: unknown }>; verdict: unknown } };
  const replayed = e0.replayE0Golden(golden);
  assert.deepEqual(replayed.arms.map((arm) => [arm.arm, arm.metrics]), golden.result.arms.map((arm: { arm: string; metrics: unknown }) => [arm.arm, arm.metrics]));
  assert.deepEqual(replayed.verdict, golden.result.verdict);
  assert.equal(golden.result.cost.usdPerQuestion.d, (2400 / 1_000_000) * 0.042);
});

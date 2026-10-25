import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './bundleEntry.mts';
import { readBody, readManifest, readResponses, sendBatch } from './promptBatch.mts';
import { loadBatchKit } from './promptBatchMeasures.mts';
import { DEFAULT_SAGA_REPLY, loadScenarioKit, saga } from './promptBatchScenarios.mts';

const GOLDEN = join(REPO_ROOT, 'test/measurements/v2.9/11-b2/saga-golden');
const RECAPTURE = 'recapture on a no-model lane: node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-prompt-batch.mts capture --measurement saga --profile <memory profile> --out <dir>, then copy manifest.json, bodies/ and contexts/ over the golden';

test('saga golden: both epilogue bodies carry the shipped saga prompt rebuilt today from the frozen records, and differ only in the token limit', async () => {
  const manifest = await readManifest(GOLDEN);
  const kit = await loadScenarioKit();
  const [contextFile] = await readdir(join(GOLDEN, 'contexts'));
  const context = JSON.parse(await readFile(join(GOLDEN, 'contexts', contextFile), 'utf-8'));
  const { prompt } = await kit.sagaPrompt(context);
  const shas = [...new Set(manifest.items.map((item) => item.sha as string))];
  assert.equal(shas.length, 2, RECAPTURE);
  const [normal, long] = await Promise.all(shas.map(async (sha) => JSON.parse(await readBody(GOLDEN, sha))));
  for (const body of [normal, long]) assert.ok(String(body.prompt).includes(prompt), `the saga prompt builder drifted from the frozen body; ${RECAPTURE}`);
  assert.equal(normal.n_predict, 2560);
  assert.equal(long.n_predict, 4096);
  const strip = (body: Record<string, unknown>) => ({ ...body, max_tokens: 0, max_new_tokens: 0, n_predict: 0, num_predict: 0 });
  assert.deepEqual(strip(normal), strip(long));
  assert.ok(manifest.items.every((item) => !item.problem && item.builderInBody && item.selfCheck?.ok));
});

test('saga golden: send + score report verifySaga per response and replay saga()\'s two attempts with the larger-token retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-saga-golden-'));
  await cp(GOLDEN, dir, { recursive: true });
  const manifest = await readManifest(dir);
  const answers = [
    { content: `${DEFAULT_SAGA_REPLY} Later Captain Vell of Brindlemoor came to thank them.`, stop_type: 'eos' },
    { content: 'Arin smiled at the sea.', stop_type: 'eos' },
    { content: DEFAULT_SAGA_REPLY.slice(0, 400), stop_type: 'limit' },
    { content: '<|channel>thought\nlong thinking<channel|>', stop_type: 'limit' },
    { content: DEFAULT_SAGA_REPLY, stop_type: 'eos' },
  ];
  let index = 0;
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ...answers[index++], stop: true, tokens_evaluated: 900, tokens_predicted: 300, model: 'fake' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const kit = await loadBatchKit();
  try {
    const sent = await sendBatch({ dir, baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, finishOf: kit.readFinish });
    assert.equal(sent.ok, manifest.items.length);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const { ok, report } = await saga.score(dir, manifest, await readResponses(dir), kit, {});
  assert.equal(ok, null);
  const rows = report.results as Array<{ id: string; accepted: boolean; reasons: string[]; invented: string[]; words: number }>;
  assert.deepEqual(rows.map((row) => [row.id, row.accepted]), [['saga#1', false], ['saga#2', false], ['saga#3', false], ['saga#4', false], ['saga-long#1', true]]);
  assert.deepEqual(rows[0].invented, ['Captain', 'Vell', 'Brindlemoor']);
  assert.match(rows[0].reasons.join(), /names not in the records/);
  assert.deepEqual(rows[1].reasons, ['the epilogue is too short']);
  assert.deepEqual(rows[2].reasons, ['cut at the token limit (refuseIncomplete)']);
  assert.match(rows[3].reasons.join(), /cut at the token limit|refused before verifySaga/);
  assert.deepEqual(report.flows, [{ attempts: ['saga#1', 'saga#2'], outcome: 'fallback' }, { attempts: ['saga#3', 'saga-long#1'], outcome: 'epilogue' }]);
});

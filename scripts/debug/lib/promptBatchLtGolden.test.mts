import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { cp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './bundleEntry.mts';
import { FILES, readBody, readManifest, readResponses, sendBatch, sha256 } from './promptBatch.mts';
import { loadBatchKit } from './promptBatchMeasures.mts';
import { rate } from './promptBatchRater.mts';
import { loadScenarioKit, lt06, ltCorpus } from './promptBatchScenarios.mts';
import { testTempDir } from '../../lib/testTemp.mjs';

const GOLDEN = join(REPO_ROOT, 'test/measurements/v2.9/11-b2/lt06-golden');
const RECAPTURE = 'recapture on a no-model lane: node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-prompt-batch.mts capture --measurement lt06 --only s01,s05 --profile <memory profile> --out <dir>, then copy manifest.json, bodies/ and contexts/ over the golden';

const contextOf = async (dir: string, sha: string) => JSON.parse(await readFile(join(dir, 'contexts', `${sha}.json`), 'utf-8'));

test('lt06 golden: frozen on the frozen corpus; each body carries the suggestions prompt rebuilt today from its frozen context, and the canned answer parses offline to the panel lines', async () => {
  const manifest = await readManifest(GOLDEN);
  const { corpusSha } = await ltCorpus();
  assert.equal(manifest.args.corpus, corpusSha, RECAPTURE);
  const planned = await lt06.plan({ only: 's01,s05' });
  assert.deepEqual(manifest.items.map((item) => item.id), planned.map((item) => item.id));
  const kit = await loadBatchKit();
  const kit2 = await loadScenarioKit();
  for (const item of manifest.items) {
    assert.ok(item.sha && !item.problem && item.builderInBody && item.selfCheck?.ok, `${item.id}: golden item not clean`);
    const inPage = item.inPage as { contextSha: string; asks: number; anchors: Array<{ kind: string }> };
    const context = await contextOf(GOLDEN, inPage.contextSha);
    assert.equal(sha256(`${JSON.stringify(context)}\n`), inPage.contextSha);
    const { prompt, anchors } = await kit2.suggestionPrompt(context);
    assert.ok(String(JSON.parse(await readBody(GOLDEN, item.sha)).prompt).includes(prompt), `${item.id}: the suggestions prompt drifted; ${RECAPTURE}`);
    assert.deepEqual(anchors.length > 0, (item.meta as { arm: string }).arm === 'anchored', item.id);
    const canned = planned.find((entry) => entry.id === item.id)?.canned as string;
    const reply = kit.textCompletionReply(JSON.parse(canned), manifest.route.instruct);
    const lines = await kit2.suggestionLines(context, reply.text, reply.finish);
    assert.deepEqual(lines.shown.map((line) => ({ text: line.text, anchor: line.anchor })), context.record.lines.map((line: { text: string; anchor: string | null }) => ({ text: line.text, anchor: line.anchor })), item.id);
    assert.equal(inPage.asks, 1);
  }
});

const suggestions = (prompt: string, leak: 'none' | 'visible' | 'hidden') => {
  const tagged = prompt.includes('Build on these things');
  const anchor = /\[1\] ([^\n]+)/.exec(prompt)?.[1] ?? '';
  return [tagged ? `- [1] I work on this: ${anchor}` : '- I look around the landing.', '- I ask Arin what she would try.', '- I check what I am carrying.', leak === 'hidden' ? '- I go looking at the old pier.' : leak === 'visible' ? '- I ask about the drowned bell.' : '- I wait and watch for a while.'].join('\n');
};

async function sendAll(dir: string, leakOn: (prompt: string) => 'none' | 'visible' | 'hidden', stop = true) {
  const kit = await loadBatchKit();
  const manifest = await readManifest(dir);
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const prompt = String(JSON.parse(Buffer.concat(chunks).toString('utf-8')).prompt);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ content: `<|channel>thought\n<channel|>${suggestions(prompt, leakOn(prompt))}`, stop: true, stop_type: 'eos', tokens_evaluated: 800, tokens_predicted: 60, model: 'fake' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await sendBatch({ dir, baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, finishOf: kit.readFinish, stop: stop ? lt06.stop?.(dir, manifest, kit) : undefined });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('lt06 golden: the declared stop rule halts at the first hidden leak needle (S3), not at a needle the prompt already shows', async () => {
  const dir = await testTempDir('so-lt06-stop-');
  await cp(GOLDEN, dir, { recursive: true });
  const result = await sendAll(dir, (prompt) => (!prompt.includes('SO-V29-06 LT s05') ? 'none' : prompt.includes('Build on these things') ? 'hidden' : 'visible'));
  assert.equal(result.stopped?.stopped, 'S3');
  assert.equal(result.stopped?.at, '4/4');
  assert.match(result.stopped?.detail ?? '', /s05\/anchored/);
  assert.match(result.stopped?.detail ?? '', /zero floor leak/);
  assert.ok(existsSync(join(dir, FILES.stop)));
  const { report } = await lt06.score(dir, await readManifest(dir), await readResponses(dir), await loadBatchKit(), {});
  const rows = report.results as Array<{ id: string; needles: string[]; visibleNeedles: string[] }>;
  assert.deepEqual(rows.filter((row) => row.id.startsWith('s05')).map((row) => [row.id, row.needles, row.visibleNeedles]), [['s05/current', [], ['drowned bell']], ['s05/anchored', ['old pier'], []]]);
  assert.equal((report.floors as { F3_leaks: { pass: boolean | null } }).F3_leaks.pass, false);
});

test('lt06 golden: score gives the per-row facts, rate fills both rater passes blind, and the floors close', async () => {
  const dir = await testTempDir('so-lt06-score-');
  await cp(GOLDEN, dir, { recursive: true });
  const sent = await sendAll(dir, () => 'none');
  assert.equal(sent.stopped, null);
  const kit = await loadBatchKit();
  const manifest = await readManifest(dir);
  const before = await lt06.score(dir, manifest, await readResponses(dir), kit, {});
  assert.equal(before.ok, null, 'rater floors stay open before rate');
  const rows = before.report.results as Array<{ id: string; usable: boolean; grounded: boolean; needles: string[]; shown: Array<{ text: string; anchor: string | null }> }>;
  assert.deepEqual(rows.map((row) => [row.id, row.usable, row.grounded, row.needles.length]), [['s01/current', true, false, 0], ['s01/anchored', true, true, 0], ['s05/current', true, false, 0], ['s05/anchored', true, true, 0]]);
  const prompts: string[] = [];
  const runner = async (file: string) => {
    const prompt = await readFile(file, 'utf-8');
    prompts.push(prompt);
    if (prompt.includes('SET 1:')) {
      const sizes = [...prompt.matchAll(/SET (?:1|2):\n((?:\d+\. .*\n?)+)/g)].map((match) => match[1].trim().split('\n').length);
      const set = (size: number, usefulness: number) => ({ lines: Array.from({ length: size }, () => ({ usable: true, leak: false })), usefulness });
      const anchoredFirst = /SET 1:\n1\. I work on this/.test(prompt);
      return { code: 0, stderr: '', text: JSON.stringify({ set1: set(sizes[0], anchoredFirst ? 5 : 3), set2: set(sizes[1], anchoredFirst ? 3 : 5), notes: 'n' }) };
    }
    return { code: 0, stderr: '', text: '{"engages": true, "why": "it acts on the anchor"}' };
  };
  const rated = await rate(dir, {}, runner);
  assert.deepEqual([rated.passA.kept, rated.passB.kept, rated.problems], [2, 2, []]);
  assert.ok(prompts.every((prompt) => !prompt.includes('[1]') && !/anchor:/i.test(prompt.split('SET 1:')[1] ?? '')), 'pass A shows no tags');
  const after = await lt06.score(dir, manifest, await readResponses(dir), kit, {});
  const floors = after.report.floors as Record<string, { pass: boolean | null; meanDelta?: number }>;
  assert.deepEqual(Object.fromEntries(Object.entries(floors).map(([key, value]) => [key, value.pass])), { F1_usable: true, F2_grounded: true, F3_leaks: true, F4_usefulness: true, F5_one_call: true });
  assert.equal(floors.F4_usefulness.meanDelta, 2);
  assert.equal(after.ok, true);
  const again = await rate(dir, {}, async () => { throw new Error('must not rerun'); });
  assert.deepEqual([again.passA.ran, again.passB.ran], [0, 0]);
});

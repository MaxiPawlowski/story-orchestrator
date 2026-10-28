import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './bundleEntry.mts';
import { readBody, readManifest, readResponses, sendBatch, sha256 } from './promptBatch.mts';
import { cannedBackendJson, loadBatchKit, t8 } from './promptBatchMeasures.mts';
import { testTempDir } from '../../lib/testTemp.mjs';

const GOLDEN = join(REPO_ROOT, 'test/measurements/v2.9/11-b2/t8-golden');
const RECAPTURE = 'recapture on a no-model lane: node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-prompt-batch.mts capture --measurement t8 --out <dir> --verify test/measurements/v2.9/11-b2/t8-golden, then copy <dir> over the golden';

test('t8 golden: every frozen body hashes to its sha and carries the shipped read prompt built from the fixture today', async () => {
  const manifest = await readManifest(GOLDEN);
  const kit = await loadBatchKit();
  const planned = await t8.plan({});
  assert.deepEqual(manifest.items.map((item) => item.id), planned.map((item) => item.id), RECAPTURE);
  for (const item of planned) {
    const frozen = manifest.items.find((entry) => entry.id === item.id);
    assert.ok(frozen?.sha && !frozen.problem && frozen.builderInBody && frozen.selfCheck?.ok, `${item.id}: golden item not clean`);
    const body = JSON.parse(await readBody(GOLDEN, frozen.sha));
    const { story, transcript, ...overrides } = item.spec as { story: unknown; transcript: unknown };
    const live = await kit.fixtureLive({ story, transcript, overrides }, 'NO_DELTA');
    assert.equal(live.prompt, frozen.inPage?.prompt, `${item.id}: the read prompt builder drifted from the frozen page prompt; ${RECAPTURE}`);
    assert.ok(String(body.prompt).includes(live.prompt), `${item.id}: the frozen body no longer carries the builder prompt; ${RECAPTURE}`);
    assert.equal(body.api_type, manifest.route.api);
  }
});

test('t8 golden: offline reply processing and parse of each canned answer equal what the page produced at capture', async () => {
  const manifest = await readManifest(GOLDEN);
  const kit = await loadBatchKit();
  for (const item of await t8.plan({})) {
    const frozen = manifest.items.find((entry) => entry.id === item.id);
    const check = await t8.selfCheck(item, frozen?.inPage ?? {}, frozen?.calls ?? 0, item.canned, kit, manifest.route.instruct);
    assert.deepEqual(check, { ok: true }, item.id);
  }
});

test('t8 golden: send delivers the frozen bytes unchanged and score reproduces the live-suite verdict on the canned answers', async () => {
  const dir = await testTempDir('so-prompt-batch-golden-');
  await cp(GOLDEN, dir, { recursive: true });
  const manifest = await readManifest(dir);
  const planned = new Map((await t8.plan({})).map((item) => [item.id, item]));
  const bySha = new Map(manifest.items.map((item) => [item.sha, planned.get(item.id)?.canned]));
  const seen: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const sha = sha256(Buffer.concat(chunks).toString('utf-8'));
      seen.push(sha);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(bySha.get(sha) ?? cannedBackendJson('NO_DELTA'));
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
  assert.deepEqual(seen, manifest.items.map((item) => item.sha));
  const { ok, report } = await t8.score(dir, manifest, await readResponses(dir), kit, {});
  assert.equal(ok, true);
  assert.equal(report.plotDeltaAccuracy, 1);
  assert.deepEqual((report.results as Array<{ name: string; pass: boolean }>).map((row) => [row.name, row.pass]), manifest.items.map((item) => [item.id, true]));
});

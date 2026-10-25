import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWitness } from './lib/witness.mts';
import { recordAll, scoreOneRead, stopFile, witnessDeclaration, type PlannedSet, type ReadRecord, type RecordResult, type RecordSpec, type WitnessScoreKit } from './lib/witnessRecord.mts';

const planned = (reads: number): PlannedSet => ({
  key: 'S/S-1', story: { roster: [] }, chat: [], members: [{ id: 'Mara', name: 'Mara', aliases: [] }], messages: [],
  reads: Array.from({ length: reads }, (_, index) => ({ readId: `S/S-1#r${index + 1}`, from: index * 4, to: index * 4 + 3, presentIds: ['mara'], presentNames: ['Mara'], state: null })),
});

const reply: RecordResult = { prompt: 'p', rawResponse: 'NO_DELTA', inputTokens: 10, outputTokens: 5, calls: [{ finish: 'stop', ms: 5, maxTokens: 512, model: 'm' }], window: { from: 0, to: 3 }, scope: 1, rejected: 0, witness: { status: 'accepted' } };

const quiet = () => {};

test('record interleaves arms per read and a stop leaves balanced pairs written to stop.json; a stopped run is never resumed', async () => {
  const out = await mkdtemp(join(tmpdir(), 'so-witstop-'));
  const order: string[] = [];
  const run = async (spec: RecordSpec) => { order.push(spec.present ? 'on' : 'off'); return reply; };
  const score = async () => ({ exactSet: { hits: 0, of: 4 }, asideKeptOut: 0 });
  const result = await recordAll([planned(40)], ['on', 'off'], run, out, { log: quiet, score });
  assert.deepEqual(order.slice(0, 4), ['on', 'off', 'on', 'off']);
  assert.equal(result.stopped?.stopped, 'S2');
  assert.equal(result.stopped?.at, '10/40');
  assert.deepEqual(result.records, { on: 10, off: 10 });
  assert.deepEqual(result.stopped?.counts.metrics.exactSet, { hits: 0, of: 40, rate: 0 });
  assert.deepEqual(JSON.parse(await readFile(stopFile(out), 'utf-8')).stopped, 'S2');
  await assert.rejects(recordAll([planned(40)], ['on', 'off'], run, out, { log: quiet, score }), /never resumed/);
});

test('--no-stop runs every read; a zero-floor leak stops at once; W4 declares every pair needed', async () => {
  const out = await mkdtemp(join(tmpdir(), 'so-witstop-'));
  const run = async () => reply;
  const full = await recordAll([planned(12)], ['on', 'off'], run, out, { log: quiet, noStop: true, score: async () => ({ exactSet: { hits: 0, of: 4 } }) });
  assert.equal(full.stopped, null);
  assert.deepEqual(full.records, { on: 12, off: 12 });
  assert.equal(existsSync(stopFile(out)), false);
  const leak = await recordAll([planned(12)], ['on'], run, await mkdtemp(join(tmpdir(), 'so-witstop-')), { log: quiet, score: async (_set, record: ReadRecord) => ({ asideKeptOut: record.readId.endsWith('#r3') ? 1 : 0 }) });
  assert.equal(leak.stopped?.stopped, 'S3');
  assert.equal(leak.stopped?.at, '3/12');
  assert.equal(witnessDeclaration(37).needsAll, true);
});

test('a read that throws twice stops the run as S5, not a measurement, even under --no-stop', async () => {
  let calls = 0;
  const run = async () => { calls += 1; if (calls >= 3) throw new Error('connect ECONNREFUSED 127.0.0.1:18888'); return reply; };
  const result = await recordAll([planned(10)], ['on', 'off'], run, await mkdtemp(join(tmpdir(), 'so-witstop-')), { log: quiet, noStop: true });
  assert.equal(result.stopped?.stopped, 'S5');
  assert.equal(result.stopped?.verdict, 'not-a-measurement');
  assert.equal(result.stopped?.at, '2/10');
  assert.equal(calls, 4);
});

test('one read scores against the labels inside its own window', async () => {
  const dir = join(process.cwd(), 'test/fixtures/witness/synthetic');
  const reads = JSON.parse(await readFile(join(dir, 'reads-good.json'), 'utf-8'));
  const labels = JSON.parse(await readFile(join(dir, 'labels.json'), 'utf-8'));
  const kit = (await loadWitness()) as unknown as WitnessScoreKit;
  const read = reads.reads.find((entry: { readId: string }) => entry.readId === 'r2');
  const set: PlannedSet = { key: reads.set, story: null, chat: [], members: reads.members, messages: reads.messages, reads: [] };
  const record: ReadRecord = { readId: read.readId, arm: 'on', from: read.from, to: read.to, present: read.present ?? null, status: read.status, inputTokens: 0, outputTokens: 0, calls: [], response: read.response, scope: 0, rejected: 0 };
  const metrics = scoreOneRead(kit, labels, set, record) as Record<string, { hits: number; of: number }>;
  const inWindow = labels.labels.filter((label: { messageId: number }) => label.messageId >= read.from && label.messageId <= read.to).length;
  assert.equal(metrics.coverage.of, inWindow);
  assert.ok(metrics.exactSet.of > 0 && metrics.exactSet.hits <= metrics.exactSet.of);
  assert.equal(typeof metrics.asideKeptOut, 'number');
  assert.deepEqual(scoreOneRead(kit, { ...labels, labels: [] }, set, record), {});
});

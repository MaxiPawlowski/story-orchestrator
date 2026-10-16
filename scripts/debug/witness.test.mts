import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRIVATE_DIR, REPO_ROOT, refusePrivateOutput } from './lib/bundleEntry.mts';
import { checkReads, scoreReads } from './lib/witness.mts';
import { main } from './so-witness.mts';

const SYNTHETIC = join(process.cwd(), 'test/fixtures/witness/synthetic');
const LABELS = join(SYNTHETIC, 'labels.json');
const GOOD = join(SYNTHETIC, 'reads-good.json');
const PLANTED = join(SYNTHETIC, 'reads-all-present.json');
const GOLDEN = join(process.cwd(), 'test/goldens/witness');

const quiet = async <T,>(run: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
};

test('witness: the synthetic fixture meets the plan 42 shape (>= 40 labels, >= 8 asides, >= 3 mixed, >= 2 unknown, a whisper)', async () => {
  const labels = JSON.parse(await readFile(LABELS, 'utf-8'));
  const reads = JSON.parse(await readFile(GOOD, 'utf-8'));
  const asides = labels.labels.filter((label: { heard: unknown; present: string[]; spans?: unknown[] }) => !label.spans && Array.isArray(label.heard) && label.heard.length < label.present.length);
  assert.equal(labels.labels.length >= 40, true);
  assert.equal(asides.length >= 8, true);
  assert.equal(labels.labels.filter((label: { spans?: unknown[] }) => label.spans?.length).length >= 3, true);
  assert.equal(labels.labels.filter((label: { heard: unknown }) => label.heard === 'unknown').length >= 2, true);
  assert.equal(reads.messages.some((message: { text: string }) => /whispers/.test(message.text)), true);
});

test('witness: the good recorded reads pass every floor and beat the presence null control; replay equals the golden', async () => {
  const result = await scoreReads(LABELS, GOOD);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.nullControlBeaten, true);
  assert.equal(result.nullControl.verdict, 'fail');
  assert.deepEqual(result, JSON.parse(await readFile(join(GOLDEN, 'synthetic-good-result.json'), 'utf-8')));
  assert.equal(await quiet(() => main(['score', '--labels', LABELS, '--reads', GOOD])), 0);
});

test('witness: planted all-present reads fail W4a and W4fi (and the null-control margin); exit 1', async () => {
  const result = await scoreReads(LABELS, PLANTED);
  assert.equal(result.witness.floors.asideExactSet, false);
  assert.equal(result.witness.floors.falseInclusion, false);
  assert.equal(result.witness.floors.asideKeptOut, false);
  assert.equal(result.nullControlBeaten, false);
  assert.equal(result.verdict, 'fail');
  assert.deepEqual(result, JSON.parse(await readFile(join(GOLDEN, 'synthetic-all-present-result.json'), 'utf-8')));
  assert.equal(await quiet(() => main(['score', '--labels', LABELS, '--reads', PLANTED])), 1);
});

test('witness refusal: private output inside the public repo outside test/sessions/', async () => {
  assert.throws(() => refusePrivateOutput(false, join(REPO_ROOT, 'test/goldens/witness/x.json'), 'witness'), /private witness output/);
  assert.doesNotThrow(() => refusePrivateOutput(false, join(PRIVATE_DIR, 'witness', 'x.json'), 'witness'));
  assert.doesNotThrow(() => refusePrivateOutput(false, join(tmpdir(), 'x.json'), 'witness'));
  assert.doesNotThrow(() => refusePrivateOutput(true, join(REPO_ROOT, 'test/goldens/witness/x.json'), 'witness'));
  const work = await mkdtemp(join(tmpdir(), 'so-witness-private-'));
  const labels = JSON.parse(await readFile(LABELS, 'utf-8'));
  await writeFile(join(work, 'labels.json'), JSON.stringify({ ...labels, synthetic: false }));
  await assert.rejects(() => main(['score', '--labels', join(work, 'labels.json'), '--reads', GOOD, '--out', join(REPO_ROOT, 'test/goldens/witness/private.json')]), /private witness output/);
});

test('witness review rule: private labels without two different agreeing reviewers are dropped; too few kept is insufficient (exit 2)', async () => {
  const work = await mkdtemp(join(tmpdir(), 'so-witness-review-'));
  const labels = JSON.parse(await readFile(LABELS, 'utf-8'));
  const reviewed = labels.labels.map((label: Record<string, unknown>, index: number) => ({
    ...label,
    review: index < 30 ? { writer: 'model-a', checker: 'model-b', agreed: true } : index < 35 ? { writer: 'model-a', checker: 'model-a', agreed: true } : index < 40 ? { writer: 'model-a', checker: 'model-b', agreed: false } : null,
  }));
  const file = join(work, 'labels.json');
  await writeFile(file, JSON.stringify({ ...labels, synthetic: false, labels: reviewed }));
  const result = await scoreReads(file, GOOD);
  assert.deepEqual({ kept: result.counts.kept, dropped: result.counts.dropped, verdict: result.verdict, synthetic: result.synthetic }, { kept: 30, dropped: 14, verdict: 'insufficient', synthetic: false });
  assert.equal(await quiet(() => main(['score', '--labels', file, '--reads', GOOD, '--out', join(work, 'out.json')])), 2);
});

test('witness reads file: refuses a wrong format, a bad status and a message without text', () => {
  const base = { format: 'so-witness-reads/1', set: 's', synthetic: true, members: [{ id: 'a', name: 'A' }], messages: [{ messageId: 0, speaker: 'A', text: 'x' }], reads: [] };
  assert.doesNotThrow(() => checkReads(base));
  assert.throws(() => checkReads({ ...base, format: 'other' }), /not so-witness-reads\/1/);
  assert.throws(() => checkReads({ ...base, reads: [{ readId: 'r', from: 0, to: 0, status: 'maybe', response: '' }] }), /invalid read/);
  assert.throws(() => checkReads({ ...base, messages: [{ messageId: 0, speaker: 'A' }] }), /messages must be/);
});

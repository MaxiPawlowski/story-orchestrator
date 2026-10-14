import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compare, reconstruct } from './lib/j6dReplay.mts';
import { main } from './so-j6d-replay.mts';

const FIXTURE = join(process.cwd(), 'test/fixtures/j6d/session-synthetic');
const REPLIES = join(process.cwd(), 'test/fixtures/j6d/replies.json');
const GOLDEN = join(process.cwd(), 'test/goldens/j6d/replay-summary.json');

const copySession = async (edit?: (dir: string) => Promise<void>) => {
  const dir = join(await mkdtemp(join(tmpdir(), 'so-j6d-test-')), 'session');
  await cp(FIXTURE, dir, { recursive: true });
  if (edit) await edit(dir);
  return dir;
};

const runtimeFile = async (dir: string) => join(dir, (await readdir(dir)).find((name) => name.startsWith('runtime-')) as string);

test('J6d C: the synthetic session rebuilds 7 judged reads (28 keys), skips the judge failure and refuses the canon it cannot rebuild', async () => {
  const [session] = (await reconstruct([await copySession()])).sessions;
  assert.equal(session.audits, 9);
  assert.equal(session.cases.length, 7);
  assert.equal(session.rebuiltKeys, 28);
  assert.deepEqual(session.skipped, { 'not-judged': 0, 'judge-failed': 1 });
  assert.deepEqual(session.refusals.map((entry) => entry.code), ['prompt-mismatch']);
});

test('J6d C refusal: a window the archived transcripts do not cover', async () => {
  const dir = await copySession(async (target) => {
    const lines = (await readFile(join(target, 'transcripts.jsonl'), 'utf-8')).split('\n').filter(Boolean);
    await writeFile(join(target, 'transcripts.jsonl'), `${lines.slice(0, 4).join('\n')}\n`);
    await writeFile(join(target, 'chat-full-j6d-synthetic.json'), '[]');
  });
  const [session] = (await reconstruct([dir])).sessions;
  assert.ok(session.refusals.filter((entry) => entry.code === 'window-not-covered').length >= 4);
});

test('J6d C refusal: an archived prompt that does not re-render byte for byte', async () => {
  const dir = await copySession(async (target) => {
    const text = await readFile(join(target, 'journal.jsonl'), 'utf-8');
    await writeFile(join(target, 'journal.jsonl'), text.replaceAll('pours tea', 'pours wine'));
  });
  const [session] = (await reconstruct([dir])).sessions;
  assert.ok(session.refusals.some((entry) => entry.code === 'prompt-mismatch' && /section Transcript:/.test(entry.reason)));
  assert.ok(session.cases.length < 7);
});

test('J6d C refusal: a read with no boundary snapshot at or after its window', async () => {
  const dir = await copySession(async (target) => {
    const file = await runtimeFile(target);
    const blob = JSON.parse(await readFile(file, 'utf-8'));
    const record = Object.values(blob.stories)[0] as { engineHistory: { base: { lastMessageId: number }; log: Array<{ after: { lastMessageId: number } }> } };
    record.engineHistory.base.lastMessageId = -1;
    record.engineHistory.log = record.engineHistory.log.filter((entry) => entry.after.lastMessageId < 10);
    await writeFile(file, JSON.stringify(blob));
  });
  const [session] = (await reconstruct([dir])).sessions;
  assert.ok(session.refusals.some((entry) => entry.code === 'missing-snapshot'));
});

test('J6d C: an unchanged judge answer reads the reconstructed blackboard value', async () => {
  const [session] = (await reconstruct([await copySession()])).sessions;
  const late = session.cases.find((entry) => entry.window.to === 14);
  assert.deepEqual(late?.answered.find((entry) => entry.key === 'has_map')?.judge, { moved: false, value: true });
  assert.equal(late?.answered.find((entry) => entry.key === 'has_map')?.before, true);
});

test('J6d C compare: the recorded replies replay to the jest golden; no replies is deferred, never a rate', async () => {
  const reconstruction = await reconstruct([await copySession()]);
  const result = await compare(reconstruction, JSON.parse(await readFile(REPLIES, 'utf-8')));
  const golden = JSON.parse(await readFile(GOLDEN, 'utf-8'));
  const { skipped, ...summary } = result.summary;
  assert.deepEqual(summary, golden.summary);
  assert.deepEqual(skipped, { 'not-judged': 0, 'judge-failed': 1 });
  assert.equal((await compare(reconstruction, {})).summary.verdict, 'deferred');
});

test('J6d C CLI: reconstruct, prompts and compare run offline; compare without replies exits 2', async () => {
  const work = await mkdtemp(join(tmpdir(), 'so-j6d-cli-'));
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(['reconstruct', await copySession(), '--out', join(work, 'cases.json')]), 0);
    assert.equal(await main(['prompts', join(work, 'cases.json'), '--out', join(work, 'prompts')]), 0);
    assert.equal((await readdir(join(work, 'prompts'))).length, 7);
    assert.equal(await main(['compare', join(work, 'cases.json'), '--replies', REPLIES, '--out', join(work, 'record.json')]), 0);
    assert.equal(await main(['compare', join(work, 'cases.json')]), 2);
  } finally {
    console.log = log;
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ackPaths, drainGate, readTailAcks, tailProblems, waitFor, writeAck } from './sessionTails.mts';

test('AS-22 tails: a drain request lets one full poll run before the tail stops', () => {
  let requested = false;
  const gate = drainGate(() => requested);
  assert.equal(gate(), false);
  requested = true;
  assert.equal(gate(), false, 'the poll in flight when the request lands may have started before it');
  assert.equal(gate(), true);
});

test('AS-22 tails: start needs a ready acknowledgement from every tail, stop also needs a clean drain', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'so-tails-'));
  assert.equal(tailProblems(await readTailAcks(dir), 'start').length, 3);
  for (const name of ['journal.jsonl', 'payloads.jsonl', 'console.jsonl']) await writeAck(ackPaths(resolve(dir, name)).ready, { tail: name });
  assert.deepEqual(tailProblems(await readTailAcks(dir), 'start'), []);
  const stopping = tailProblems(await readTailAcks(dir), 'stop');
  assert.equal(stopping.length, 3);
  assert.ok(stopping.every((line) => /final drain/.test(line)));
  await writeAck(ackPaths(resolve(dir, 'journal.jsonl')).drained, { ok: true });
  await writeAck(ackPaths(resolve(dir, 'console.jsonl')).drained, { ok: true });
  await writeAck(ackPaths(resolve(dir, 'payloads.jsonl')).drained, { ok: false, dropped: 3 });
  const gap = tailProblems(await readTailAcks(dir), 'stop');
  assert.equal(gap.length, 1);
  assert.match(gap[0], /payloads tail drained with a gap/);
  await writeFile(ackPaths(resolve(dir, 'payloads.jsonl')).drained, 'not json', 'utf-8');
  assert.match(tailProblems(await readTailAcks(dir), 'stop')[0], /never acknowledged its final drain/);
});

test('AS-22 tails: waiting for an acknowledgement gives up at its deadline instead of hanging', async () => {
  let reads = 0;
  const none = await waitFor(async () => { reads += 1; return null; }, 30, 10);
  assert.equal(none, null);
  assert.ok(reads >= 2);
  assert.deepEqual(await waitFor(async () => ({ ok: true }), 30, 10), { ok: true });
});

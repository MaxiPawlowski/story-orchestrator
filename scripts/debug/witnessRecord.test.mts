import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { membersFor, plumbingReply, readsFile, recordSet, stateAt, stChat, wcFrom, writeReadsFiles, type PlannedSet, type ReadRecord, type RecordResult } from './lib/witnessRecord.mts';

const story = { roster: [{ id: 'mara', name: 'Mara', aliases: ['The Smith'] }, { id: 'ben', name: 'Ben' }] };
const set: PlannedSet = {
  key: 'T9/T9-1', story, chat: stChat([{ id: 0, name: 'Rin', isUser: true, text: 'hi' }, { id: 2, name: 'Mara', isUser: false, text: 'hello' }]),
  members: membersFor(['Mara', 'Ben', 'Ula'], [{ id: 'mara', name: 'Mara', aliases: ['The Smith'] }, { id: 'ben', name: 'Ben', aliases: [] }]).map(({ id, name, aliases }) => ({ id, name, aliases })),
  messages: [{ messageId: 0, speaker: 'Rin', text: 'hi' }, { messageId: 2, speaker: 'Mara', text: 'hello' }],
  reads: [{ readId: 'T9/T9-1#r1', from: 0, to: 2, presentIds: ['mara', 'ben'], presentNames: ['Mara', 'Ben', 'Ula'], state: null }],
};

test('chat rows keep ST indices; gaps are system rows; members key by name with roster ids as aliases', () => {
  assert.equal(set.chat.length, 3);
  assert.equal(set.chat[1].is_system, true);
  assert.deepEqual(set.chat[2], { name: 'Mara', mes: 'hello', is_user: false, is_system: false });
  assert.deepEqual(set.members[0], { id: 'Mara', name: 'Mara', aliases: ['The Smith'] });
  assert.deepEqual(set.members[2], { id: 'Ula', name: 'Ula', aliases: [] });
});

test('the engine state comes from the boundary log at the read end', () => {
  const runtime = { stories: { s: { engineHistory: { log: [
    { context: { lastMessageId: 3 }, before: { activeCheckpointId: 'a' }, after: { activeCheckpointId: 'a', boundary: 1 } },
    { context: { lastMessageId: 9 }, before: { activeCheckpointId: 'a' }, after: { activeCheckpointId: 'b', boundary: 2 } },
  ] } } } };
  assert.deepEqual(stateAt(runtime, 1), { activeCheckpointId: 'a' });
  assert.deepEqual(stateAt(runtime, 9), { activeCheckpointId: 'b', boundary: 2 });
});

const result = (finish: string, input: number, output: number, ms: number): RecordResult => ({
  prompt: 'p', rawResponse: 'NO_DELTA\nWITNESS m=2 heard=Mara', inputTokens: input, outputTokens: output, calls: [{ finish, ms, maxTokens: 512, model: 'm' }],
  window: { from: 0, to: 2 }, scope: 3, rejected: 0, witness: { status: 'accepted' },
});

test('record resumes, sends witness present only on the on arm, and plumbing marks records that are never scored or measured', async () => {
  const out = await mkdtemp(join(tmpdir(), 'so-witrec-'));
  const seen: unknown[] = [];
  const run = async (spec: unknown) => { seen.push(spec); return result('stop', 100, 20, 50); };
  await recordSet(set, 'off', run, out, () => {});
  await recordSet(set, 'on', run, out, () => {});
  await recordSet(set, 'on', run, out, () => {});
  assert.equal(seen.length, 2);
  assert.equal((seen[0] as { present: unknown }).present, null);
  assert.deepEqual((seen[1] as { present: unknown }).present, ['mara', 'ben']);
  const file = readsFile(set, [{ readId: 'r', arm: 'on', from: 0, to: 2, present: ['Mara'], status: 'accepted', inputTokens: 1, outputTokens: 1, calls: [], response: 'x', scope: 1, rejected: 0 }]);
  assert.equal(file.format, 'so-witness-reads/1');
  assert.equal('plumbing' in file, false);
  const planted = await mkdtemp(join(tmpdir(), 'so-witrec-'));
  await recordSet(set, 'on', run, planted, () => {}, plumbingReply);
  await assert.rejects(writeReadsFiles([set], planted), /plumbing/);
  assert.equal(plumbingReply(set.reads[0]).split('\n').length, 4);
});

test('Wc compares the on arm with the off arm per read', () => {
  const read = (arm: 'on' | 'off', readId: string, input: number, output: number, finish: string, ms: number): ReadRecord => ({
    readId, arm, from: 0, to: 2, present: null, status: 'accepted', inputTokens: input, outputTokens: output, calls: [{ finish, ms, maxTokens: 512, model: 'm' }], response: '', scope: 1, rejected: 0,
  });
  const off = [read('off', 'a', 1000, 50, 'stop', 1000), read('off', 'b', 1000, 50, 'stop', 1000)];
  const ok = wcFrom([read('on', 'a', 1110, 150, 'stop', 1100), read('on', 'b', 1100, 140, 'stop', 1100)], off);
  assert.deepEqual(ok.floors, { addedInputP95: true, addedOutputP95: true, lengthRate: true, latencyP95: true });
  const bad = wcFrom([read('on', 'a', 1200, 300, 'length', 2000), read('on', 'b', 1100, 140, 'stop', 1100)], off);
  assert.deepEqual(bad.floors, { addedInputP95: false, addedOutputP95: false, lengthRate: false, latencyP95: false });
});

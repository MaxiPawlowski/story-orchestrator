import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planPresence, presentAtFrom, recordPresence, scorePresence, omniscientNames, type PresenceRow } from './lib/witnessPresence.mts';
import type { PlannedSet } from './lib/witnessRecord.mts';

const review = { writer: 'a', checker: 'b', agreed: true };
const set: PlannedSet = {
  key: 'S/1',
  story: {
    title: 'Toy', checkpoints: [{ id: 'cp1', name: 'Forge', objective: 'Find the key' }],
    roster: [{ id: 'narr', name: 'Narrator', view: 'omniscient' }, { id: 'mara', name: 'Mara', role: 'smith' }, { id: 'ben', name: 'Ben' }, { id: 'extra', name: 'Nobody' }],
  },
  chat: Array.from({ length: 12 }, (_, id) => ({ name: id % 3 ? 'Mara' : 'Max', mes: `line ${id}`, is_user: id % 3 === 0 })),
  members: [{ id: 'Narrator', name: 'Narrator', aliases: [] }, { id: 'mara', name: 'mara', aliases: [] }, { id: 'Ben', name: 'Ben', aliases: [] }],
  messages: Array.from({ length: 12 }, (_, id) => ({ messageId: id, speaker: id % 3 ? 'Mara' : 'Max', text: `line ${id}` })),
  reads: [{ readId: 'S/1#r1', from: 2, to: 9, presentIds: [], presentNames: [], state: { activeCheckpointId: 'cp1' } }],
};
const labels = {
  set: 'S/1', synthetic: false, members: ['Narrator', 'mara', 'Ben'],
  labels: [
    { messageId: 9, present: ['mara', 'Ben'], review },
    { messageId: 11, present: ['mara'], review },
    { messageId: 5, present: [], review: { writer: 'a', checker: 'b', agreed: false } },
  ],
};

test('witness presence: one tracker scene read per kept label, window of 8 ending at the message, roster ids mapped to label members', async () => {
  const items = planPresence([set], new Map([['S/1', labels]]));
  assert.deepEqual(items.map((item) => item.messageId), [9, 11]);
  const first = items[0];
  assert.deepEqual(first.input.window.map((line) => line.text), ['line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7', 'line 8', 'line 9']);
  assert.equal(first.input.player, 'Max');
  assert.equal(first.input.checkpointName, 'Forge');
  assert.deepEqual(first.input.families, { sceneBreak: false, tracker: true, lookahead: false });
  assert.deepEqual(first.input.cast.find((member) => member.rosterId === 'mara'), { rosterId: 'mara', name: 'Mara', role: 'smith' });
  assert.deepEqual(first.names, { narr: 'Narrator', mara: 'mara', ben: 'Ben' });
  assert.deepEqual(omniscientNames(set), ['Narrator']);
  const dir = await mkdtemp(join(tmpdir(), 'presence-'));
  const file = join(dir, 'presence-reads.json');
  const answers = [{ narr: 0.9, mara: 0.95, ben: 0.5, extra: 0.99 }, { narr: 0.2, mara: 0.8, ben: 0.75 }];
  let call = 0;
  await recordPresence(items, async () => ({ present: answers[call++], model: 'm', latencyMs: 1, fallback: null }), file, () => undefined);
  await recordPresence(items, async () => { throw new Error('resumed run must not ask again'); }, file, () => undefined);
  const rows = (JSON.parse(await readFile(file, 'utf-8')) as { rows: PresenceRow[] }).rows;
  assert.deepEqual(rows.map((row) => row.members), [{ Narrator: 0.9, mara: 0.95, Ben: 0.5 }, { Narrator: 0.2, mara: 0.8, Ben: 0.75 }]);
  const score = scorePresence(rows, labels, 0.7);
  assert.deepEqual([score.pairAccuracy.hits, score.pairAccuracy.of, score.falsePresent.hits, score.falsePresent.of, score.falseAbsent.hits, score.band], [3, 6, 2, 3, 1, 1]);
  assert.equal(score.verdict, 'fail');
  assert.deepEqual(scorePresence(rows, labels, 0.7, ['Narrator']).falsePresent, { hits: 1, of: 1, rate: 1 });
  assert.deepEqual([...presentAtFrom(rows, 'S/1', 0.7)], [[9, ['Narrator', 'mara']], [11, ['mara', 'Ben']]]);
});

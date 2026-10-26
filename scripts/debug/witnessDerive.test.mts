import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castEnabled, derivedPredict, labelledPresence, loadDeriveKit, speakersOf, type DeriveSet } from './lib/witnessDerive.mts';

const at = (minute: number) => `2026-10-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

test('witness derive: the cast ledger gives the enabled members at each message, starting from each member\'s first before-state', () => {
  const ledger = [
    { effect: 'cast', at: at(5), target: { member: 'Ula.png' }, before: { disabled: false }, after: { disabled: true } },
    { effect: 'cast', at: at(1), target: { member: 'Ben.png' }, before: { disabled: true }, after: { disabled: false } },
    { effect: 'author_note', at: at(2) },
  ];
  const sent = new Map([[0, at(0)], [1, at(3)], [2, at(9)]]);
  const enabled = castEnabled(ledger, ['Mara', 'Ben', 'Ula'], (id) => sent.get(id) ?? null);
  assert.deepEqual(enabled(0), ['Mara', 'Ula']);
  assert.deepEqual(enabled(1), ['Mara', 'Ben', 'Ula']);
  assert.deepEqual(enabled(2), ['Mara', 'Ben']);
  assert.deepEqual(enabled(7), ['Mara', 'Ula']);
});

test('witness derive: derived reads replay through the record, and the labelled-presence diagnostic overrides the stage', async () => {
  const kit = await loadDeriveKit();
  const set: DeriveSet = {
    reads: {
      set: 'synthetic',
      members: [{ id: 'Narrator', name: 'Narrator' }, { id: 'Mara', name: 'Mara' }, { id: 'Ben', name: 'Ben' }, { id: 'Ula', name: 'Ula' }],
      messages: [
        { messageId: 0, speaker: 'Narrator', text: 'Mara and Ben wait at the forge.' },
        { messageId: 1, speaker: 'Max', text: 'I ask about the key.' },
        { messageId: 2, speaker: 'Ben', text: 'Ben whispers to Mara: under the anvil.' },
      ],
      reads: [{ readId: 'r1', from: 0, to: 2 }],
    },
    omniscient: ['Narrator'],
    enabledAt: () => ['Narrator', 'Mara', 'Ben', 'Ula'],
  };
  const options = { ...kit.DERIVE_DEFAULTS };
  const predict = derivedPredict(kit, set, options, 'window');
  assert.deepEqual(['Narrator', 'Mara', 'Ben', 'Ula'].map((member) => predict(1, member).heard), ['no', 'yes', 'yes', 'no']);
  assert.deepEqual(['Narrator', 'Mara', 'Ben', 'Ula'].map((member) => predict(0, member).heard), ['yes', 'yes', 'yes', 'no']);
  assert.deepEqual(['Mara', 'Ben', 'Ula'].map((member) => predict(2, member).heard), ['yes', 'yes', 'no']);
  const labels = { format: 'so-witness-labels/1', set: 'synthetic', synthetic: true, members: ['Mara', 'Ben', 'Ula'], labels: [{ messageId: 1, present: ['Ula'], heard: ['Ula'] }] };
  const oracle = derivedPredict(kit, { ...set, presentAt: labelledPresence(labels) }, options, 'window');
  assert.deepEqual(['Mara', 'Ben', 'Ula'].map((member) => oracle(1, member).heard), ['no', 'no', 'yes']);
  assert.equal(predict(9, 'Mara').state, 'pending');
});

test('witness derive: speakersOf maps each message to its speaker when the speaker is a labelled member, never the player', () => {
  const set = { reads: { set: 's', members: [], reads: [], messages: [{ messageId: 1, speaker: 'Mara', text: '' }, { messageId: 2, speaker: 'Max', text: '' }] }, omniscient: [], enabledAt: () => [] };
  const labels = { format: 'so-witness-labels/1', set: 's', synthetic: true, members: ['Mara', 'Ben'], labels: [] };
  assert.deepEqual([...speakersOf(set, labels)], [[1, 'Mara']]);
});

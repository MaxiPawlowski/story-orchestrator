import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatJsonl, talkMetrics } from './talkMetrics.mts';

const cast = ['Narrator', 'Mara', 'Finn'];

test('an opening with a party hook, a yielded question and a buried one', () => {
  const rows = [
    { name: 'Narrator', mes: 'The road climbs toward the gate, wet with rain and quiet.' },
    { name: 'Mara', mes: '"Rook, have you walked this road before?"' },
    { name: 'Rook', mes: 'Once, years ago.', is_user: true },
    { name: 'Narrator', mes: 'The gate creaks.' },
    { name: 'Finn', mes: '"You hear that?"' },
    { name: 'Mara', mes: '"Wind, Finn. Only wind."' },
    { name: 'Rook', mes: 'I listen.', is_user: true },
    { name: '', mes: '', is_system: true },
  ];
  const metrics = talkMetrics({ rows, player: 'Rook', lead: 'Narrator', cast });
  assert.equal(metrics.openingHook, true);
  assert.equal(metrics.turnsToFirstAddress, 1);
  assert.equal(metrics.playerQuestions, 2);
  assert.equal(metrics.yieldedAfterQuestion, 1);
  assert.equal(metrics.yieldIntegrity, 0.5);
  assert.deepEqual(metrics.voicesPerSend, { mean: 1.5, max: 3 });
  assert.equal(metrics.partyShare, 3 / 5);
});

test('a narrator-only opening has no hook and no first address', () => {
  const metrics = talkMetrics({ rows: [{ name: 'Narrator', mes: 'Rain.' }], player: 'Rook', lead: 'Narrator', cast });
  assert.equal(metrics.openingHook, false);
  assert.equal(metrics.turnsToFirstAddress, null);
  assert.equal(metrics.yieldIntegrity, null);
});

test('reads an ST chat file, skipping its metadata header and bad lines', () => {
  const rows = parseChatJsonl(['{"chat_metadata":{}}', '{"name":"Mara","mes":"Hi"}', 'not json', ''].join('\n'));
  assert.deepEqual(rows, [{ name: 'Mara', mes: 'Hi' }]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainEndMetrics, parseChainEnds, parseChatJsonl, parseSpeechLedger, speechLedgerMetrics, talkMetrics } from './talkMetrics.mts';

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

test('budget compliance, spotlight share and gaps, lead length within target', () => {
  const rows = [
    { name: 'Rook', mes: 'Go.', is_user: true },
    { name: 'Narrator', mes: 'one two three four five six seven eight nine ten' },
    { name: 'Mara', mes: '"Fine."' },
    { name: 'Finn', mes: '"Sure."' },
    { name: 'Rook', mes: 'On.', is_user: true },
    { name: 'Narrator', mes: 'one two three' },
    { name: 'Rook', mes: 'And?', is_user: true },
    { name: 'Narrator', mes: 'one two' },
    { name: 'Mara', mes: '"Hm."' },
  ];
  const metrics = talkMetrics({ rows, player: 'Rook', lead: 'Narrator', cast, budget: 2, leadWords: 4 });
  assert.deepEqual(metrics.budget, { limit: 2, rounds: 3, compliant: 2, rate: 2 / 3 });
  assert.deepEqual(metrics.spotlight.share, { Mara: 2 / 3, Finn: 1 / 3 });
  assert.equal(metrics.spotlight.longestPartyGap, 1);
  assert.deepEqual(metrics.spotlight.longestQuiet, { Mara: 2, Finn: 2 });
  assert.deepEqual(metrics.leadLength, { target: 4, within: 2, lines: 3, rate: 2 / 3 });
});

test('reads the speech ledger from the chat file header', () => {
  const header = { chat_metadata: { story_orchestrator: { selectedStoryId: 's', stories: { s: { extras: { speech: [
    { send: 0, origin: 'chain', generated: true, messageId: 2 },
    { send: 0, origin: 'npc', generated: false, messageId: 3 },
    { send: 0, origin: 'chain', generated: true, messageId: null },
    { send: -1, origin: 'entry', generated: false, messageId: 0 },
  ] } } } } } };
  const ledger = parseSpeechLedger([JSON.stringify(header), '{"name":"Mara","mes":"Hi"}'].join('\n'));
  assert.deepEqual(speechLedgerMetrics(ledger), { events: 4, byOrigin: { chain: 2, npc: 1, entry: 1 }, failedAttempts: 1, maxVoicesPerSend: 2 });
  assert.deepEqual(parseSpeechLedger('{"name":"Mara","mes":"Hi"}'), []);
});

test('v3.0 19 stage 3: reads why each chain ended from the chat file header', () => {
  const header = { chat_metadata: { story_orchestrator: { selectedStoryId: 's', stories: { s: { extras: { chainEnds: [
    { messageId: 2, revision: null, checkpointId: 'cp', voices: 2, reason: 'cap' },
    { messageId: 5, revision: null, checkpointId: 'cp', voices: 1, reason: 'yield' },
    { messageId: 7, revision: null, checkpointId: 'cp', voices: 0, reason: 'judge' },
    { messageId: 9, revision: null, checkpointId: 'cp', voices: 1, reason: 'yield' },
  ] } } } } } };
  const ends = parseChainEnds([JSON.stringify(header), '{"name":"Mara","mes":"Hi"}'].join('\n'));
  assert.deepEqual(chainEndMetrics(ends), { chains: 4, byReason: { cap: 1, yield: 2, judge: 1 }, meanVoices: 1 });
  assert.deepEqual(chainEndMetrics(parseChainEnds('{"name":"Mara","mes":"Hi"}')), { chains: 0, byReason: {}, meanVoices: null });
});

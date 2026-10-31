import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, capitalisedChats, chatDrift, cosineDistance, driftVerdict, editDistance, nameNearMisses, nameVocabulary, trigramProfile, type DriftReply } from './voiceDrift.mts';
import { distinctReplies, parseChatLines, sessionChatLines } from './voiceCorpus.mts';
import { crossCensus, nameCensus } from '../so-voice-census.mts';

test('position buckets follow the predeclared edges', () => {
  assert.equal(bucketOf(1), '1-10');
  assert.equal(bucketOf(10), '1-10');
  assert.equal(bucketOf(11), '11-30');
  assert.equal(bucketOf(61), '61+');
  assert.equal(bucketOf(0), null);
});

test('cosine distance is 0 for the same text and grows for a different voice', () => {
  const same = trigramProfile(['the night is cold']);
  assert.equal(cosineDistance(same, trigramProfile(['the night is cold'])), 0);
  const other = cosineDistance(same, trigramProfile(['zzz qqq xxx']));
  assert.ok(other !== null && other > 0.9);
  assert.equal(cosineDistance(trigramProfile([]), same), null);
});

const voice = (member: string, from: number, to: number, line: string): DriftReply[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ member, position: from + index, text: `${line} ${index % 3}` }));

test('a member that keeps its voice has no own drift and stays apart from the other member', () => {
  const replies = [...voice('Mara', 1, 70, 'aye, the tide waits for no one, lad'), ...voice('Bram', 1, 70, 'Indeed. Most irregular, I must say.')];
  const drift = chatDrift(replies);
  const mara = drift.members.find((member) => member.member === 'Mara');
  assert.equal(mara?.own['61+'], 0);
  assert.ok((drift.between['61+'] ?? 0) > 0.3);
  const verdict = driftVerdict([drift]);
  assert.equal(verdict.betweenOk, true);
});

test('a member who converges on the other voice fails the between floor', () => {
  const replies = [
    ...voice('Mara', 1, 30, 'aye, the tide waits for no one, lad'), ...voice('Mara', 31, 70, 'Indeed. Most irregular, I must say.'),
    ...voice('Bram', 1, 70, 'Indeed. Most irregular, I must say.'),
  ];
  const verdict = driftVerdict([chatDrift(replies)]);
  assert.equal(verdict.betweenOk, false);
  assert.equal(verdict.ownOk, false);
});

test('the card example arm measures distance to mes_example', () => {
  const drift = chatDrift(voice('Mara', 1, 12, 'aye, the tide waits'), { Mara: 'aye, the tide waits for no one' });
  assert.ok((drift.members[0].card['1-10'] ?? 1) < 0.5);
});

test('edit distance caps and counts', () => {
  assert.equal(editDistance('Tobias', 'Tobies'), 1);
  assert.equal(editDistance('Tobias', 'Tobias'), 0);
  assert.ok(editDistance('a', 'abcdefgh') > 3);
});

test('near misses skip English words, plurals, possessives and established names', () => {
  const texts = ['keep the fort below', 'Darran nods.', 'Darran waves.', 'Darran sits.'];
  const vocabulary = nameVocabulary(texts, ['Dalan', 'Kela'], capitalisedChats([[texts[1]], [texts[2]], [texts[3]]]));
  assert.deepEqual(nameNearMisses('Keep moving. Darran smiles. Dalan\'s blade. Kelas.', ['Dalan', 'Kela'], vocabulary), []);
  assert.deepEqual(nameNearMisses('Tobies laughs.', ['Tobias'], vocabulary), [{ name: 'Tobias', seen: 'Tobies' }]);
  assert.deepEqual(nameNearMisses('Kelo laughs.', ['Kela'], vocabulary), [{ name: 'Kela', seen: 'Kelo' }]);
  assert.deepEqual(nameNearMisses('Kezo laughs.', ['Kela'], vocabulary), []);
});

const chat = parseChatLines('c1', [
  '{"chat_metadata":{}}',
  JSON.stringify({ name: 'Max', is_user: true, mes: 'Hello.' }),
  JSON.stringify({ name: 'Mara', mes: '*Mara nods.* "We leave at dawn, and nobody stays behind tonight."\nBram: "Agreed."' }),
  JSON.stringify({ name: 'Bram', mes: '"Fine," Mara said.' }),
  JSON.stringify({ name: 'System', is_system: true, mes: 'ignored' }),
]);

test('corpus parsing keeps players, members and drops system rows; session dumps read the same', () => {
  assert.deepEqual(chat.players, ['Max']);
  assert.deepEqual(chat.members, ['Mara', 'Bram']);
  assert.equal(distinctReplies([chat, chat]).length, 2);
  const session = parseChatLines('s1', sessionChatLines([{ name: 'Max', text: 'Hi', isUser: true }, { name: 'Mara', text: 'Yes', isUser: false }]));
  assert.deepEqual(session.members, ['Mara']);
});

test('cross census counts header and prose hits and what the trim keeps', () => {
  const result = crossCensus([chat]);
  assert.equal(result.replies, 2);
  assert.equal(result.header, 1);
  assert.equal(result.trimmed, 1);
  assert.equal(result.leftAfterTrim, 0);
  assert.equal(result.said, 1);
});

test('name census counts near misses per 1000 replies', () => {
  const result = nameCensus([chat, parseChatLines('c2', [JSON.stringify({ name: 'Tobias', mes: 'Here.' }), JSON.stringify({ name: 'Bram', mes: 'Tobies is late.' })])]);
  assert.equal(result.nearMisses, 1);
});

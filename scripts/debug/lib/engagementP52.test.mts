import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreement, candidates, pairs, pick, pushedScore, readLabel, readRate, type ChatRow, type SessionBlob, type TurnRow } from './engagementP52.mts';

const chat: ChatRow[] = Array.from({ length: 12 }, (_, id) => ({ id, name: id % 2 ? 'Arin' : 'You', isUser: id % 2 === 0, isSystem: false, text: `line ${id}` }));
const entry = (end: number, cpStart: number, boundary: number) => ({
  at: boundary, boundary, fired: null, context: { lastMessageId: end },
  before: { blackboard: { values: {} } }, after: { blackboard: { values: {} }, checkpointStartedMessageId: cpStart },
});
const blob: SessionBlob = { log: [entry(1, -1, 1), entry(3, -1, 2), entry(5, -1, 3), entry(7, 4, 4), entry(9, 4, 5), entry(11, 4, 6)], memory: [], tension: [{ messageId: 0 }], promises: [] };

test('a candidate needs three player turns inside the checkpoint and a reply after the last', () => {
  const rows = candidates('S', blob, chat);
  assert.deepEqual(rows.map((row) => [row.end, row.turns]), [[5, [0, 2, 4]], [11, [6, 8, 10]]]);
});

test('a window before the tension history starts is skipped', () => {
  assert.deepEqual(candidates('S', { ...blob, tension: [{ messageId: 3 }] }, chat).map((row) => row.end), [11]);
});

test('pick caps windows per session and is stable for a seed', () => {
  const rows = [...candidates('S', blob, chat), ...candidates('T', blob, chat)];
  const first = pick(rows, 3, 1, 'x');
  assert.equal(first.length, 2);
  assert.deepEqual(pick(rows, 3, 1, 'x'), first);
});

test('labels and agreement: none matches a null reading, the floor needs 40 windows', () => {
  assert.deepEqual(readLabel('noise {"label":"uncertain","why":"asks"}'), { label: 'uncertain', why: 'asks' });
  assert.ok('problem' in readLabel('{"label":"bored"}'));
  const result = agreement([{ label: 'none', kind: null }, { label: 'uncertain', kind: 'repeating' }]);
  assert.equal(result.agree, 1);
  assert.equal(result.pass, false);
});

test('pairs are blind and the score unseals by arm from the ladder turn', () => {
  const row = (turn: number, arm: boolean): TurnRow => ({ turn, arm, player: `p${turn}`, replies: [{ name: 'Arin', mes: `${arm}` }], reading: null, rungLead: null, infoLine: false, aftermathLine: false });
  const { pack, key } = pairs([[row(1, true), row(4, true)]], [[row(1, false), row(4, false)]], 's');
  assert.equal(pack.length, 2);
  assert.ok(pack.every((item) => !JSON.stringify(item).includes('"on"')));
  const rated = Object.fromEntries(key.map((item) => [item.id, item.a === 'on' ? { a: false, b: true } : { a: true, b: false }]));
  const turnOf = Object.fromEntries(pack.map((item) => [item.id, item.turn]));
  assert.deepEqual(pushedScore(key, rated, turnOf, 4), { pairs: 1, pushedOn: 0, pushedOff: 1, floor: 'on <= 0.5 x off', pass: true });
  assert.ok('problem' in readRate('{"a":{"pushed":"yes"}}'));
});

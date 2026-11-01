import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReply, parseFactsBlock, parseLedgerBlock, rateReplies, sentences } from './lib/contradictionScore.mts';
import { newReplies, type LoudPrompt } from './lib/payloadChats.mts';
import { calibration } from './so-contradiction-rate.mts';

test('calibration on the planted pairs meets the predeclared floors and is pinned', async () => {
  const result = await calibration();
  assert.equal(result.passed, true);
  assert.deepEqual({ pairs: result.pairs, caught: result.caught, recall: result.recall, falseAlarm: result.falseAlarm },
    { pairs: 32, caught: 27, recall: 0.875, falseAlarm: 0.031 });
  assert.deepEqual(result.misses, ['F07', 'T03', 'T07', 'K08']);
});

test('a ledger value is contradicted only by a rival value of the same field, never by the value itself', () => {
  const context = { ledger: [{ entity: 'Mara', field: 'location', value: 'the harbor' }], values: { location: ['the harbor', 'the market'] } };
  assert.equal(checkReply(context, 'Mara waits at the market for the boats.')[0]?.detector, 'value');
  assert.deepEqual(checkReply(context, 'Mara walks from the market to the harbor and sits.'), []);
  assert.deepEqual(checkReply(context, 'Kael waits at the market for the boats.'), []);
});

test('numbers clash only on the same counted noun', () => {
  const context = { earlier: ['Rhee counts three guards at the north gate.'] };
  assert.equal(checkReply(context, 'Rhee says the five guards at the north gate are tired.')[0]?.detector, 'number');
  assert.deepEqual(checkReply(context, 'Rhee says the five horses at the north gate are tired.'), []);
});

test('questions, speaker prefixes and short exclamations are not claims', () => {
  assert.deepEqual(sentences('Luke: No... Did you see that? He draws his sword and steps into the hall.'), ['He draws his sword and steps into the hall.']);
  assert.deepEqual(checkReply({ earlier: ['Luke: No...'] }, 'Luke: The sewers are not safe tonight.'), []);
});

test('the ledger and facts blocks parse from a prompt', () => {
  const system = 'x\nCurrent state:\nMara: location=the harbor | mood=calm\nKael: status=wounded\n\n[Established facts — true in this story; stay consistent with them]\nThe bridge fell.\nThe vault is empty.\n\n[Details from this session]\nother';
  assert.deepEqual(parseLedgerBlock(system), [
    { entity: 'Mara', field: 'location', value: 'the harbor' }, { entity: 'Mara', field: 'mood', value: 'calm' }, { entity: 'Kael', field: 'status', value: 'wounded' },
  ]);
  assert.deepEqual(parseFactsBlock(system), ['The bridge fell.', 'The vault is empty.']);
});

test('rates replies per 100 with source, category and length buckets', () => {
  const context = { facts: ['The vault beneath the chapel is empty.'] };
  const rate = rateReplies([
    { text: 'Mara says the vault beneath the chapel is not empty at all.', position: 3, context },
    { text: 'Mara lights a candle in the chapel.', position: 30, context },
  ]);
  assert.equal(rate.contradictions, 1);
  assert.equal(rate.per100, 50);
  assert.equal(rate.bySource.fact, 1);
  assert.deepEqual(rate.byLength.map((bucket) => bucket.replies), [1, 1, 0]);
});

test('new replies are the model turns a later prompt adds', () => {
  const turn = (role: string, text: string) => ({ role, text, raw: '' });
  const prompt = (history: ReturnType<typeof turn>[]): LoudPrompt => ({ chat: 'c', member: 'm', index: 0, prompt: '', history, system: '' });
  const replies = newReplies([prompt([turn('user', 'hi')]), prompt([turn('user', 'hi'), turn('model', 'Hello there.'), turn('user', 'go')])]);
  assert.deepEqual(replies.map((reply) => [reply.text, reply.position]), [['Hello there.', 1]]);
});

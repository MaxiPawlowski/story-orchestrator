import assert from 'node:assert/strict';
import test from 'node:test';
import { draftInputs, FLOORS, parseRatings, ratePrompt, readChat, score, type CarryItem, type Rating } from './l5Carry.mts';

const item = (key: string, line: string, reason: string | null = null): CarryItem => ({ key, messageId: Number(key.slice(1)), member: 'Kael', line, reason, reasoning: 'Kael wants the map.' });
const rating = (key: string, over: Partial<Rating> = {}): Rating => ({ key, aim: true, meta: false, player: false, performed: false, ...over });

test('readChat drops the metadata header and broken lines', () => {
  const rows = readChat(['{"chat_metadata":{}}', '{"name":"Kael","mes":"Hi"}', 'not json', ''].join('\n'));
  assert.deepEqual(rows, [{ name: 'Kael', mes: 'Hi' }]);
});

test('draftInputs replays each reply with reasoning as a draft after the next player line', () => {
  const rows = readChat([
    JSON.stringify({ name: 'Max', mes: 'Go', is_user: true }),
    JSON.stringify({ name: 'Kael', mes: 'No', extra: { reasoning: 'Kael wants the map.' } }),
    JSON.stringify({ name: 'Lyra', mes: 'Hm' }),
  ].join('\n'));
  const drafts = draftInputs(rows);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].messageId, 1);
  assert.deepEqual(drafts[0].input.players, ['Max']);
  assert.equal(drafts[0].input.rows.length, 3);
  assert.equal((drafts[0].input.rows.at(-1) as { is_user?: boolean }).is_user, true);
});

test('ratePrompt carries every key; parseRatings keeps only complete entries', () => {
  assert.match(ratePrompt([item('m1', 'x'), item('m2', 'y')]), /"key":"m2"/);
  const parsed = parseRatings('noise {"ratings":[{"key":"m1","aim":true,"meta":false,"player":false,"performed":false},{"key":"m2","aim":true}]} tail');
  assert.deepEqual(parsed, [rating('m1')]);
  assert.deepEqual(parseRatings('no json'), []);
});

test('score passes at the floors and names each miss', () => {
  const items = Array.from({ length: 40 }, (_, index) => item(`m${index}`, index < 20 ? 'aim' : '', index < 20 ? null : 'no-aim'));
  const good = items.slice(0, 20).map((entry, index) => rating(entry.key, index < 4 ? { aim: false } : {}));
  assert.equal(score(items, good).verdict, 'pass');
  assert.equal(score(items, good).precision, 0.8);
  assert.deepEqual(score(items, good).reasons, { 'no-aim': 20 });
  const leaky = good.map((entry, index) => (index === 19 ? { ...entry, meta: true, player: true } : entry));
  const result = score(items, leaky);
  assert.equal(result.verdict, 'fail');
  assert.ok(result.misses.some((miss) => miss.startsWith('precision')));
  assert.ok(result.misses.some((miss) => miss.startsWith('player lines')));
  assert.equal(score(items, good.slice(0, FLOORS.minRated - 1)).verdict, 'incomplete');
  const sparse = [...items.slice(0, 20), ...Array.from({ length: 80 }, (_, index) => item(`n${index}`, '', 'no-reasoning'))];
  assert.ok(score(sparse, good).misses.some((miss) => miss.startsWith('yield')));
});

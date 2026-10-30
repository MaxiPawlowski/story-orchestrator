import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armPrompts, buildPairs, packLeaks, parseJudge, parsePrompt, stability, verdict, type Judged } from './lib/compactionRating.mts';
import { splitReasoning } from './so-compaction-rating.mts';

const turn = (role: string, text: string) => `<|turn>${role}\n${text}<turn|>\n`;
const promptOf = (messages: number, extra = '') =>
  turn('system', 'head card') + Array.from({ length: messages }, (_, index) => turn('model', `Ash: line ${index} ${'w '.repeat(60)}`)).join('') + extra + turn('system', '[note]') + '<|turn>model\nAsh:';

test('parsePrompt keeps the head, the body turns and the open tail', () => {
  const parsed = parsePrompt(promptOf(3));
  assert.equal(parsed.head.length, 1);
  assert.equal(parsed.body.length, 4);
  assert.equal(parsed.tail, '<|turn>model\nAsh:');
});

test('the compact arm drops a leading history chunk; the trim arm drops only what does not fit', () => {
  const built = armPrompts(promptOf(120), 2000, 2);
  assert.ok(built.cutId !== null && built.cutId > 0);
  assert.ok(built.compact.length < built.trim.length);
  assert.ok(built.compact.startsWith(turn('system', 'head card')));
  assert.ok(built.compact.endsWith('<|turn>model\nAsh:'));
  assert.ok(built.compact.includes('[note]') && built.trim.includes('[note]'));
  assert.equal(armPrompts(promptOf(5), 2000, 2).cutId, null);
});

test('compaction keeps the prompt start stable across growing turns where trimming moves it', () => {
  const trim: string[] = [];
  const compact: string[] = [];
  for (let length = 100; length < 120; length += 1) {
    const built = armPrompts(promptOf(length), 2000, 2);
    trim.push(built.trim);
    compact.push(built.compact);
  }
  assert.ok(stability([compact], 'compact').trunkMoves < stability([trim], 'trim').trunkMoves);
});

test('the pack is blind and the verdict reads the sealed key', () => {
  const replies = { trim: { text: 'one' }, compact: { text: 'two' } };
  const { pairs, key } = buildPairs('s', Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, prompt: promptOf(4), replies })));
  assert.deepEqual(packLeaks(pairs), []);
  const judged: Record<string, Judged> = {};
  for (const pair of pairs) {
    const compactLetter = key.pairs[pair.id].A === 'compact' ? 'A' : 'B';
    const flat = { continuity: 4, voice: 4, scene: 4, agency: 4, overall: 4 };
    judged[pair.id] = { scores: { A: flat, B: flat }, prefer: compactLetter };
  }
  const result = verdict(judged, key);
  assert.equal(result.pairs, 30);
  assert.equal(result.compactPreferredOrTied, 30);
  assert.equal(result.pass, true);
  assert.equal(verdict({}, key).pass, false);
});

test('parseJudge refuses an out-of-range score and splitReasoning keeps the thought out of the reply', () => {
  assert.ok('problem' in parseJudge('{"A":{"continuity":9}}'));
  const flat = '{"continuity":3,"voice":3,"scene":3,"agency":3,"overall":3}';
  assert.equal((parseJudge(`x {"A":${flat},"B":${flat},"prefer":"tie"}`) as Judged).prefer, 'tie');
  assert.deepEqual(splitReasoning('<|channel>thought\nhm<channel|>Hello'), { text: 'Hello', reasoning: '<|channel>thought\nhm<channel|>' });
});

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

test('v3.0 41 A1: real counts split a tokenized prompt at each turn start, and the fit trims nothing a real-token cut already made room for', async () => {
  const { chunkCounts, realCountsOf, stTrims, parsePrompt: parse } = await import('./lib/compactionRating.mts');
  assert.deepEqual(chunkCounts([2, 105, 9, 106, 105, 7, 7, 106, 105, 4]), [1, 3, 4, 2]);
  const prompt = turn('system', 'head') + turn('user', 'Ash: hi') + '<|turn>model\n';
  const counts = realCountsOf(prompt, [2, 105, 1, 1, 106, 105, 5, 5, 5, 106, 105, 4, 4]);
  assert.equal(counts?.head, 5);
  assert.equal(counts?.segments.get(parse(prompt).body[0].raw), 5);
  assert.equal(realCountsOf(prompt, [2, 105, 1]), null);
  const long = promptOf(120);
  const real = (segment: { text: string }) => Math.ceil(segment.text.trim().length / 2);
  assert.equal(stTrims(long, 2000, 2, real, 10, 5, 'real').trimmed, 0);
  assert.ok(stTrims(long, 2000, 2, real, 10, 5, 'estimate').trimmed > 0);
});

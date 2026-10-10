import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerLeaks, scoreAskRun, scoreAuthorAnswer, topicShowMe, type AskAnswerRecord } from './askQaScore.mts';

const record = (patch: Partial<AskAnswerRecord>): AskAnswerRecord => ({ id: 'a01', persona: 'author', ok: true, answer: 'x', topics: [], showMe: null, steps: 1, refused: 0, ...patch });

test('topic ids map to the Show me the product derives', () => {
  assert.deepEqual(topicShowMe('feature/memory-tab'), { kind: 'feature', target: 'memory-tab' });
  assert.deepEqual(topicShowMe('author/gates'), { kind: 'studio', target: 'gates' });
  assert.deepEqual(topicShowMe('guide/player/troubleshooting#faq'), { kind: 'doc', target: 'player/troubleshooting.md#faq' });
  assert.equal(topicShowMe('st/groups'), null);
});

test('an author answer passes only with an accepted topic and a correct Show me', () => {
  const question = { id: 'a01', q: 'q', accept: ['author/world-info', 'st/lorebook-activation'] };
  assert.equal(scoreAuthorAnswer(question, record({ topics: ['author/world-info'], showMe: { kind: 'studio', target: 'world-info' } }), topicShowMe).pass, true);
  assert.equal(scoreAuthorAnswer(question, record({ topics: ['st/lorebook-activation'], showMe: null }), topicShowMe).pass, false);
  assert.equal(scoreAuthorAnswer({ ...question, showMeOptional: true }, record({ topics: ['st/lorebook-activation'], showMe: null }), topicShowMe).pass, true);
  assert.equal(scoreAuthorAnswer(question, record({ topics: ['author/world-info'], showMe: { kind: 'feature', target: 'judge' } }), topicShowMe).reason, 'wrong Show me');
  assert.equal(scoreAuthorAnswer(question, record({ ok: false }), topicShowMe).pass, false);
});

test('a player answer that names an unreached needle is a leak (control), a clean one is not', () => {
  assert.deepEqual(playerLeaks(record({ answer: 'Corvin did it.' }), ['Corvin']), ['Corvin']);
  assert.deepEqual(playerLeaks(record({ answer: 'I can only talk about what you have played so far.' }), ['Corvin']), []);
});

test('the run passes only at the author floor and with every player answer clean', () => {
  const author = Array.from({ length: 3 }, (_, index) => ({ id: `a${index}`, q: 'q', accept: ['feature/memory'] }));
  const good = (id: string) => record({ id, topics: ['feature/memory'], showMe: { kind: 'feature', target: 'memory' } });
  const base = { author, player: [{ id: 'p1', q: 'q' }], unreached: ['Corvin'], authorFloor: 2, showMeOf: topicShowMe };
  assert.equal(scoreAskRun({ ...base, records: [good('a0'), good('a1'), record({ id: 'p1', persona: 'player', answer: 'clean' })] }).pass, true);
  assert.equal(scoreAskRun({ ...base, records: [good('a0'), good('a1'), record({ id: 'p1', persona: 'player', answer: 'Corvin' })] }).pass, false);
  assert.equal(scoreAskRun({ ...base, records: [good('a0'), record({ id: 'p1', persona: 'player', answer: 'clean' })] }).pass, false);
});

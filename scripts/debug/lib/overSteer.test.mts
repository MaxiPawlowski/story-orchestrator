import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDANCE_FAMILY, longestSharedSpan, restateCheck, swing } from './overSteer.mts';

const block = 'Let the ferryman hint that the eastern crossing is watched, without saying by whom.';

test('a reply that restates the block fails the restate check', () => {
  const reply = 'The old man leans on his pole. "The eastern crossing is watched, without saying by whom," he mutters.';
  const verdict = restateCheck(block, reply, GUIDANCE_FAMILY);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.span >= 6, `span ${verdict.span}`);
});

test('a reply that names the steering fails even with no shared span', () => {
  const verdict = restateCheck(block, 'Following the scene direction, the ferryman shrugs and poles on.', GUIDANCE_FAMILY);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.metaHits, ['Scene direction']);
});

test('control: a reply that acts on the block in its own words passes', () => {
  const reply = 'The ferryman glances at the far bank twice before he speaks, and his voice drops when you ask about the east.';
  const verdict = restateCheck(block, reply, GUIDANCE_FAMILY);
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  assert.ok(verdict.span < 6);
});

test('spans are counted over normalised words: case and punctuation do not break a run', () => {
  assert.equal(longestSharedSpan('The Eastern crossing, is watched!', 'the eastern crossing is watched'), 5);
  assert.equal(longestSharedSpan('', 'anything'), 0);
});

test('swing is recorded against the control arm, never gated', () => {
  const result = swing('one two three four', 'one two');
  assert.equal(result.lengthRatio, 2);
  assert.equal(result.sharedWithControl, 2);
  assert.equal(swing('words', '').lengthRatio, null);
});

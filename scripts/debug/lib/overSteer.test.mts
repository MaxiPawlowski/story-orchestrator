import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTINUITY_FAMILY, GUIDANCE_FAMILY, OVER_STEER_FAMILIES, longestSharedSpan, overSteerSpec, overSteerVerdict, restateCheck, swing, type OverSteerReading } from './overSteer.mts';

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

test('overSteerSpec names the block key and a known family, and refuses anything else', () => {
  assert.deepEqual(overSteerSpec({ block: 'story_orchestrator_guidance', family: 'guidance' }), { block: 'story_orchestrator_guidance', family: 'guidance' });
  assert.deepEqual(overSteerSpec({ block: 'k', family: 'guidance', controlRun: { global: '__c' } }).controlRun, { global: '__c' });
  assert.throws(() => overSteerSpec({ family: 'guidance' }), /expected \{block/);
  assert.throws(() => overSteerSpec({ block: 'k', family: 'puppet' }), /unknown family "puppet"/);
  assert.throws(() => overSteerSpec({ block: 'k', family: 'guidance', controlRun: '' }), /controlRun/);
});

const reading = (overrides: Partial<OverSteerReading> = {}): OverSteerReading => ({ captured: `Scene direction: ${block}`, current: null, reply: 'The ferryman glances at the far bank twice before he speaks.', control: null, ...overrides });

test('the verdict gates on the block the generation CARRIED, preferring the capture over the next prompt', () => {
  const verdict = overSteerVerdict({ block: 'k', family: 'guidance' }, reading({ current: 'something else entirely' }));
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  assert.equal(verdict.block.source, 'capture');
  assert.equal(verdict.swing, null);
});

test('a restating reply fails the verdict and says why', () => {
  const verdict = overSteerVerdict({ block: 'k', family: 'guidance' }, reading({ reply: 'He says the eastern crossing is watched, without saying by whom.' }));
  assert.equal(verdict.ok, false);
  assert.match(verdict.failures.join(), /restates "k"/);
});

test('an uncarried block or a missing reply is a failure, never a vacuous pass', () => {
  assert.match(overSteerVerdict({ block: 'k', family: 'guidance' }, reading({ captured: null, current: '  ' })).failures.join(), /never carried/);
  assert.match(overSteerVerdict({ block: 'k', family: 'guidance' }, reading({ reply: null })).failures.join(), /no reply N\+1/);
});

test('a named control arm records the swing, and a named but empty one fails', () => {
  const recorded = overSteerVerdict({ block: 'k', family: 'guidance', controlRun: 'The ferryman poles on.' }, reading({ control: 'The ferryman poles on.' }));
  assert.equal(recorded.ok, true);
  assert.equal(recorded.swing?.controlWords, 4);
  assert.match(overSteerVerdict({ block: 'k', family: 'guidance', controlRun: { global: '__c' } }, reading()).failures.join(), /control arm was named/);
});

test('the continuity family (v2.4 plan 07 warden baseline) names the note framing, not the fact it carries', () => {
  assert.equal(OVER_STEER_FAMILIES.continuity, CONTINUITY_FAMILY);
  assert.deepEqual(overSteerSpec({ block: 'story_orchestrator_continuity', family: 'continuity' }), { block: 'story_orchestrator_continuity', family: 'continuity' });
  const note = 'Continuity: established — The old stone bridge collapsed in the flood and is gone. Keep the next reply consistent with it.';
  assert.deepEqual(restateCheck(note, 'Continuity: the bridge is gone, so they wade.', CONTINUITY_FAMILY).metaHits, ['Continuity:']);
  assert.equal(restateCheck(note, 'Seren frowns at the empty pilings where a bridge once stood.', CONTINUITY_FAMILY).ok, true);
});

test('the T22/T23 families: agency and house-rule notes, their framing and OOC words are meta tokens', () => {
  assert.equal(OVER_STEER_FAMILIES.agency.name, 'agency');
  assert.deepEqual(restateCheck('Agency: Max\'s own words are theirs to write.', 'OOC: I will not write for Max. The guard waits.', OVER_STEER_FAMILIES.agency).metaHits, ['OOC']);
  assert.equal(restateCheck('Agency: Max\'s own words are theirs to write.', 'The guard waits for an answer.', OVER_STEER_FAMILIES.agency).ok, true);
  const rule = 'House rule: "No character uses a gun, rifle or any gunpowder weapon." — keep the next reply within it.';
  assert.equal(restateCheck(rule, 'No character uses a gun, rifle or any gunpowder weapon, so Rhee draws her cutlass.', OVER_STEER_FAMILIES['house-rule']).ok, false);
  assert.equal(restateCheck(rule, 'Rhee draws her cutlass.', OVER_STEER_FAMILIES['house-rule']).ok, true);
  assert.deepEqual(overSteerSpec({ block: 'story_orchestrator_continuity', family: 'house-rule' }), { block: 'story_orchestrator_continuity', family: 'house-rule' });
});

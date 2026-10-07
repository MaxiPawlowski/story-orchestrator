import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LiveRead } from './lib/b1Runs.mts';
import { AXES_ARMS, directionOf, scoreLifeM1, scoreLifeM2, windowSpec, type LifeArm, type RelationshipWindow } from './lib/lifeReads.mts';
import { scoreCombined, waits } from './lib/combinedScope.mts';
import { combinedSpec } from './so-b1-combined-scope.mts';

const read = (over: Partial<LiveRead> = {}): LiveRead => ({
  ms: 1000, tokens: 1000, scope: [], sources: [], deltas: [], guarded: [], facts: [], rejected: [], judged: null, prompt: '', rawResponse: '', ...over,
});

const label = (index: number): RelationshipWindow['label'] => (index < 9 ? 'up' : index < 17 ? 'down' : 'none');
const windows: RelationshipWindow[] = Array.from({ length: 20 }, (_, index) => ({
  id: `w${index}`, present: ['a', 'b'], holder: 'a', toward: 'player', axis: 'trust', start: 0,
  messages: [{ speaker: 'You', text: 'hello there' }, { speaker: 'A', text: 'hi' }],
  label: label(index), expected: { q: `rel_a_player_trust_${index}`, v: label(index) === 'up' ? 1 : label(index) === 'down' ? -1 : 0 },
}));

const answering = (wrong = 0, { stuck = 0, jump = 0 } = {}): LiveRead[] => windows.map((window, index) => {
  const target = window.label === 'up' ? 1 : window.label === 'down' ? -1 : 0;
  const value = index < wrong ? -target || 1 : index < wrong + stuck && window.label !== 'none' ? 0 : target;
  const landed = index < jump ? value * 2 : value;
  return read({ scope: [window.expected.q], guarded: landed === 0 ? [] : [{ q: window.expected.q, v: landed }], deltas: landed === 0 ? [] : [{ q: window.expected.q, v: landed }] });
});

const arms = (over: Partial<Record<LifeArm, LiveRead[]>> = {}) => ({ a: answering(2), b: answering(1), c: answering(0), ...over }) as Record<LifeArm, LiveRead[]>;

test('37 M1: direction on the guarded value, stuck over moving labels, clamp violations, a within 5 points of b', () => {
  assert.equal(directionOf(1, 0), 'up');
  assert.equal(directionOf(undefined, 0), 'none');
  const result = scoreLifeM1(windows, arms());
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.incomplete));
  assert.equal(result.defaultPath, 'judge first (arm c passed)');
  assert.equal(result.arms.a?.floors.direction.value, 0.9);
  const judgeFails = scoreLifeM1(windows, arms({ c: answering(5) }));
  assert.equal(judgeFails.verdict, 'PASS');
  assert.match(judgeFails.defaultPath, /extractor, value hidden/);
});

test('37 M1 planted failures: accuracy under 0.80, stuck over 0.10, a clamp violation, an anchored arm a', () => {
  assert.equal(scoreLifeM1(windows, arms({ a: answering(5), c: answering(5) })).verdict, 'FAIL');
  const stuck = scoreLifeM1(windows, arms({ a: answering(0, { stuck: 3 }), c: answering(5) }));
  assert.equal(stuck.arms.a?.floors.stuck.ok, false);
  assert.equal(stuck.verdict, 'FAIL');
  const clamp = scoreLifeM1(windows, arms({ c: answering(0, { jump: 1 }) }));
  assert.equal(clamp.arms.c?.floors.clampViolations.value, 1);
  assert.match(clamp.defaultPath, /extractor/);
  const anchored = scoreLifeM1(windows, arms({ a: answering(3), b: answering(0) }));
  assert.equal(anchored.anchoring.ok, false, 'a at 0.85 is 15 points under b at 1.00');
  assert.equal(anchored.verdict, 'FAIL');
});

test('37 M1 is INCOMPLETE on a missing arm, an errored read or an axis never asked', () => {
  const { c: _, ...two } = arms();
  assert.equal(scoreLifeM1(windows, two as Record<LifeArm, LiveRead[]>).verdict, 'INCOMPLETE');
  const errored = answering(0);
  errored[4] = read({ error: 'timeout' });
  assert.equal(scoreLifeM1(windows, arms({ b: errored })).verdict, 'INCOMPLETE');
  const unasked = answering(0).map((entry) => ({ ...entry, scope: [] }));
  assert.match(scoreLifeM1(windows, arms({ a: unasked })).incomplete.join(), /never put the labelled axis in scope/);
  assert.equal(scoreLifeM1(windows.slice(0, 19), arms()).verdict, 'INCOMPLETE');
});

test('37 M1 specs: arm b shows values, the labelled value seeds the blackboard, the player is the user line', () => {
  const spec = windowSpec({}, windows[0], (speaker) => speaker === 'You', 'b');
  assert.equal(spec.showValues, true);
  assert.deepEqual(spec.blackboard.values, { [windows[0].expected.q]: 0 });
  assert.deepEqual(spec.transcript.map((row) => row.is_user === true), [true, false]);
  assert.deepEqual(spec.scopeContext, { present: ['a', 'b'], drafted: 'a' });
  assert.equal('showValues' in windowSpec({}, windows[0], () => false, 'a'), false);
});

const costReads = (axes: number, tokens: number, ms = 1000) => ({ axes, reads: windows.map(() => read({ tokens, ms, sources: [{ kind: 'relationship', cap: axes, keys: Array.from({ length: axes }, (_, index) => `k${index}`), dropped: [] }] })) });
const blocks = (p: number) => Array.from({ length: 20 }, (_, index) => (index === 19 ? p : 200));

test('37 M2: the largest N under +12 % tokens and +15 % p50 sets REL_AXES_PER_READ; the life block has its own ceiling', () => {
  const base = costReads(0, 1000);
  const result = scoreLifeM2(20, base, [costReads(2, 1030), costReads(4, 1060), costReads(8, 1110), costReads(16, 1250)], blocks(500));
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.incomplete));
  assert.equal(result.relAxesPerRead, 8);
  assert.equal(result.block.p95, 200);
  assert.equal(scoreLifeM2(20, base, AXES_ARMS.map((axes) => costReads(axes, 1000)), blocks(601)).verdict, 'FAIL', 'one block over 600');
  assert.equal(scoreLifeM2(20, base, AXES_ARMS.map((axes) => costReads(axes, 1200)), blocks(200)).verdict, 'FAIL', 'no N under +12 %');
  assert.equal(scoreLifeM2(20, base, AXES_ARMS.map((axes) => costReads(axes, 1000, 1200)), blocks(200)).verdict, 'FAIL', 'p50 +20 % on every N');
  const short = scoreLifeM2(20, base, [costReads(2, 1000), costReads(4, 1000), costReads(8, 1000), { ...costReads(16, 1000), reads: costReads(9, 1000).reads }], blocks(200));
  assert.match(short.incomplete.join(), /16-axis arm put at most 9 axes in scope/);
});

const sourceRead = (questKeys: string[], questDropped: string[], relKeys: string[] = ['r1'], relDropped: string[] = [], tokens = 1050, ms = 1000) => read({
  tokens, ms, sources: [{ kind: 'card', cap: null, keys: ['c1'], dropped: [] }, { kind: 'quest', cap: 5, keys: questKeys, dropped: questDropped }, { kind: 'relationship', cap: 8, keys: relKeys, dropped: relDropped }],
});

test('S-17 fairness: a key left out more than 3 consecutive reads is over; a kept read resets the wait', () => {
  const rotating = Array.from({ length: 8 }, (_, index) => sourceRead(index % 3 === 0 ? ['q1', 'q2', 'q3'] : ['q1', 'q2'], index % 3 === 0 ? [] : ['q3']));
  assert.deepEqual(waits(rotating, 'quest'), { candidates: 3, maxWait: 2, over: 0 });
  const starved = Array.from({ length: 6 }, () => sourceRead(['q1', 'q2'], ['q3']));
  assert.deepEqual(waits(starved, 'quest'), { candidates: 3, maxWait: 6, over: 1 });
});

test('S-17 / 37-S17: both plans\' ceilings at once, fairness, and the exercise the row needs', () => {
  const baseline = windows.map(() => read({ tokens: 1000, ms: 1000 }));
  const fair = windows.map((_, index) => sourceRead(['q1', 'q2', 'q3'], [], index % 2 ? ['r1'] : ['r2'], index % 2 ? ['r2'] : ['r1']));
  const pass = scoreCombined('37-S17', { members: 7, baseline, combined: fair, blocks: blocks(300) });
  assert.equal(pass.verdict, 'PASS', JSON.stringify(pass.incomplete));
  const over12 = scoreCombined('S-17', { members: 7, baseline, combined: windows.map(() => sourceRead(['q1', 'q2', 'q3'], [], ['r1'], [], 1130)), blocks: blocks(300) });
  assert.equal(over12.floors.tokens36.ok, true);
  assert.equal(over12.floors.tokens37.ok, false, '+13 % passes 36 and fails 37: both must hold');
  assert.equal(over12.verdict, 'FAIL');
  const starvedPair = windows.map(() => sourceRead(['q1', 'q2', 'q3'], [], ['r1'], ['r2']));
  assert.equal(scoreCombined('S-17', { members: 7, baseline, combined: starvedPair, blocks: blocks(300) }).verdict, 'PASS', 'S-17 gates quests only');
  assert.equal(scoreCombined('37-S17', { members: 7, baseline, combined: starvedPair, blocks: blocks(300) }).verdict, 'FAIL', '37-S17 also gates present pairs');
  const thin = scoreCombined('S-17', { members: 6, baseline, combined: windows.map(() => sourceRead(['q1'], [])), blocks: blocks(300) });
  assert.equal(thin.verdict, 'INCOMPLETE');
  assert.match(thin.incomplete.join(), /6-member cast[\s\S]*1 active quest key/);
});

test('S-17 specs: shipped caps in the combined arm, quests and relationships off in the baseline, the read index is the card cursor', () => {
  const story = { roster: [{ id: 'a', name: 'A' }] };
  const combined = combinedSpec(story, windows[0], 4, {}, null);
  assert.equal('scopeCaps' in combined, false);
  assert.deepEqual(combined.scopeContext, { present: ['a', 'b'], drafted: 'a', cursor: 4 });
  assert.deepEqual(combinedSpec(story, windows[0], 0, {}, { quest: 0, relationship: 0 }).scopeCaps, { quest: 0, relationship: 0 });
  assert.deepEqual(combined.transcript.map((row) => row.is_user === true), [true, false]);
});

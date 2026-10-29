import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oracleExceptions, abstaining, breaksFromAudits, breaksFromReads, breaksFromResponse, candidateInputs, census, codeStage, fusePresence, seenBy } from './lib/witnessCandidates.mts';
import type { DeriveSet } from './lib/witnessDerive.mts';

const members = [{ id: 'Narrator', name: 'Narrator' }, { id: 'Mara', name: 'Mara Vell' }, { id: 'Ben', name: 'Ben' }, { id: 'Ivo', name: 'Ivo' }];
const lines: Array<[string, string]> = [
  ['Mara', 'The forge is hot.'], ['Max', 'I nod to Ben.'], ['Ben', 'Aye.'], ['Narrator', 'Night falls. The road is empty.'],
  ['Max', 'I walk on.'], ['Ivo', 'Who goes there?'], ['Max', 'A friend.'], ['Narrator', 'Ivo lowers his spear.'],
];
const messages = lines.map(([speaker, text], messageId) => ({ messageId, speaker, text }));

test('witness candidates: scene breaks come from SCENE_BREAK lines and from audits that ended by the read', () => {
  assert.deepEqual(breaksFromResponse('DELTA x=1\nSCENE_BREAK at=3 reason=time_skip\nSCENE_BREAK at=9 reason=bogus\nSCENE_NONE'), [3]);
  const audits = [{ window: { from: 0, to: 4 }, sceneBreak: { at: 3, reason: 'location' } }, { window: { from: 4, to: 9 }, sceneBreak: { at: 8, reason: 'cast' } }, { window: { from: 0, to: 2 } }];
  assert.deepEqual(breaksFromAudits(audits, 7), [3]);
  assert.deepEqual(breaksFromAudits(audits, 9), [3, 8]);
  assert.deepEqual(breaksFromReads([{ readId: 'a', from: 0, to: 4, response: 'SCENE_BREAK at=3 reason=location' }, { readId: 'b', from: 5, to: 9, response: 'SCENE_BREAK at=8 reason=cast' }], 6), [3]);
});

test('witness candidates: the code stage resets at a scene break and looks ahead only to the next one', () => {
  const seen = seenBy(messages, members);
  assert.deepEqual([...(seen.get(1) as Set<string>)], ['Ben']);
  assert.deepEqual([...(seen.get(0) as Set<string>)], ['Mara']);
  const window = { from: 2, to: 7, breaks: [3] };
  assert.deepEqual([...codeStage(seen, 2, window)].sort(), ['Ben', 'Mara']);
  assert.deepEqual([...codeStage(seen, 5, window)].sort(), ['Ivo', 'Narrator']);
  assert.deepEqual([...codeStage(seen, 5, { ...window, breaks: [] })].sort(), ['Ben', 'Ivo', 'Mara', 'Narrator']);
  assert.deepEqual([...codeStage(seen, 2, { from: 2, to: 7, breaks: [] }, 1)].sort(), ['Ben', 'Ivo', 'Narrator']);
});

test('witness candidates: the judge decides only when confident; band and missing rows keep the code stage; disagreements are named', () => {
  const code = new Set(['Mara', 'Ben']);
  assert.deepEqual(fusePresence(['Mara', 'Ben', 'Ivo', 'Narrator'], code, { Mara: 0.2, Ben: 0.5, Ivo: 0.9 }), { present: ['Ben', 'Ivo'], disagree: ['Mara', 'Ivo'], band: ['Ben'] });
  assert.deepEqual(fusePresence(['Mara', 'Ben', 'Ivo'], code, null), { present: ['Mara', 'Ben'], disagree: [], band: [] });
  assert.deepEqual(fusePresence(['Mara'], code, { Mara: 0.7 }).disagree, []);
  assert.deepEqual(fusePresence(['Ivo'], code, { Ivo: 0.3 }), { present: [], disagree: [], band: ['Ivo'] });
});

test('witness candidates: abstention turns a single-set message unknown and keeps a mixed claim', () => {
  const base = (messageId: number) => ({ state: 'classified', heard: 'yes', mixed: messageId === 2, insideHeardSpan: false });
  const predict = abstaining(base, new Set([1, 2]));
  assert.deepEqual(predict(1, 'Mara'), { state: 'unknown', heard: 'unknown', mixed: false, insideHeardSpan: false });
  assert.equal(predict(2, 'Mara').mixed, true);
  assert.equal(predict(3, 'Mara').heard, 'yes');
});

test('witness candidates: inputs per message use the last covering read; listeners skip the speaker, disabled and omniscient members; census counts pairs', () => {
  const set: DeriveSet = {
    reads: { set: 'S/1', members, messages, reads: [{ readId: 'r1', from: 0, to: 3 }, { readId: 'r2', from: 2, to: 7 }] },
    omniscient: ['Narrator'],
    enabledAt: (to) => (to >= 7 ? ['Narrator', 'Mara', 'Ben', 'Ivo'] : ['Narrator', 'Mara', 'Ben']),
  };
  const p1 = new Map([[5, { Ivo: 0.95, Mara: 0.1, Ben: 0.5 }], [6, { Ben: 0.9 }]]);
  const inputs = candidateInputs({ set, breaksAt: (to) => (to >= 7 ? [3] : []), p1 });
  assert.equal(inputs.readOf.get(2)?.readId, 'r2');
  assert.equal(inputs.readOf.get(1)?.readId, 'r1');
  assert.deepEqual(inputs.listeners.get(5), ['Mara', 'Ben']);
  assert.deepEqual(inputs.listeners.get(1), ['Mara', 'Ben']);
  assert.deepEqual(inputs.d1.get(5)?.sort(), ['Ivo', 'Narrator']);
  assert.deepEqual(inputs.d2.get(5)?.sort(), ['Ivo', 'Narrator']);
  assert.deepEqual(inputs.d2.get(6)?.sort(), ['Ben', 'Ivo', 'Narrator']);
  assert.deepEqual([...inputs.abstain], [6]);
  assert.deepEqual(inputs.exceptions.get(5), ['Ben']);
  assert.deepEqual(inputs.exceptions.get(6), ['Ben']);
  const review = { writer: 'a', checker: 'b', agreed: true };
  const labels = {
    format: 'so-witness-labels/1', set: 'S/1', synthetic: false, members: members.map((member) => member.id),
    labels: [
      { messageId: 5, present: ['Ivo'], heard: ['Ivo'], review },
      { messageId: 6, present: ['Ivo'], heard: ['Ivo'], review },
      { messageId: 4, present: [], heard: 'unknown' as const, review },
      { messageId: 7, present: ['Ivo'], heard: ['Ivo'], review: { writer: 'a', checker: 'a', agreed: true } },
    ],
  };
  const found = census(labels, inputs, p1);
  assert.deepEqual(found.messages, { single: 2, 'd3-abstains': 1, 'with-exception': 2, 'exception-pairs-absent': 2 });
  const oracle = oracleExceptions(inputs, labels);
  assert.deepEqual(oracle.get(6)?.sort(), ['Ivo', 'Narrator']);
  assert.deepEqual(oracle.get(5)?.sort(), ['Ivo', 'Narrator']);
  assert.deepEqual(oracle.get(2), inputs.d2.get(2));
  assert.deepEqual(found.sources.d1, { 'absent->off': 4, 'present->on': 1 });
  assert.deepEqual(found.sources.w2, { 'absent->on': 4, 'present->on': 1 });
  assert.deepEqual(found.sources.d2, { 'absent->off': 3, 'absent->on': 1, 'present->on': 1 });
  assert.equal(found.cells['absent|w2:on|d1:off|p1:absent'], 1);
});

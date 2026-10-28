import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseWitness, inclusionClass, type DiagnoseContext } from './lib/witnessDiagnose.mts';

const review = { writer: 'a', checker: 'b', agreed: true };
const labels = {
  format: 'so-witness-labels/1', set: 'synthetic', synthetic: false, members: ['Narrator', 'Mara', 'Ben', 'Ula'],
  labels: [
    { messageId: 0, present: ['Mara', 'Ben'], heard: ['Narrator', 'Mara', 'Ben'], review },
    { messageId: 1, present: ['Mara', 'Ben'], heard: ['Ben'], review },
    { messageId: 2, present: ['Mara'], heard: 'unknown' as const, review },
    { messageId: 3, present: ['Mara', 'Ben'], heard: ['Mara'], review: { writer: 'a', checker: 'b', agreed: false } },
    { messageId: 4, present: ['Mara', 'Ben'], heard: ['Mara', 'Ben'], spans: [{ span: [0, 5] as [number, number], heard: ['Mara'] }], review },
  ],
};
const context: DiagnoseContext = {
  speaker: (id) => (id === 0 ? 'Narrator' : id === 1 ? 'Ben' : id === 2 ? 'Mara' : null),
  enabled: () => ['Narrator', 'Mara', 'Ben'],
  omniscient: ['Narrator'],
};
const yes = { state: 'classified', heard: 'yes', mixed: false, insideHeardSpan: false };
const no = { ...yes, heard: 'no' };

test('witness diagnose: each wrong pair lands in one failure class', () => {
  assert.equal(inclusionClass('Ula', labels.labels[0], context), 'disabled');
  assert.equal(inclusionClass('Narrator', labels.labels[1], context), 'omniscient');
  assert.equal(inclusionClass('Mara', labels.labels[2], context), 'aside');
  const allHeard = diagnoseWitness(labels, () => yes, context);
  assert.deepEqual(allHeard.messages, { single: 2, unknown: 1, dropped: 1, mixed: 1 });
  assert.deepEqual(allHeard.falseInclusion, { disabled: 2, omniscient: 1, aside: 1 });
  assert.deepEqual(allHeard.exact, { 'miss:fi:disabled': 1, 'miss:fi:aside+fi:disabled+fi:omniscient': 1 });
  assert.deepEqual(allHeard.ambiguous, { omniscient: 1, speaker: 1, offstage: 1, disabled: 1 });
  assert.deepEqual(allHeard.mixed, { 'missed:single-set': 1 });
  assert.deepEqual(allHeard.spanFalseInclusion, { omniscient: 1, aside: 1, disabled: 1 });
  const noneHeard = diagnoseWitness(labels, (_, member) => (member === 'Ben' ? yes : no), context);
  assert.deepEqual(noneHeard.falseExclusion, { speaker: 1, present: 1 });
  const silent = diagnoseWitness(labels, () => ({ state: 'unknown', heard: 'unknown', mixed: false, insideHeardSpan: false }), { ...context, speakerOwn: true });
  assert.deepEqual(silent.noAnswer, { unknown: 8 });
  assert.deepEqual(silent.exact, { uncovered: 2 });
});

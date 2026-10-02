import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defectCounts, modelDefects } from './modelDefects.mts';

const CLEAN = [
  'Belle leans on the counter. "Wendhope pays triple, and it pays for a reason." She taps the posting twice.',
  'Dalan counts the coin, then counts it again. "No, no, no. That that is the price, and it had had a higher one last spring."',
  'Ellie stamps the ledger. "Ash Lanterns. Written in. Ride out at dawn."',
];

test('T1 loop guard: clean replies, stutters and allowed doubles are not defects', () => {
  assert.deepEqual(modelDefects(CLEAN.map((text, index) => ({ messageId: index, speaker: 'x', text }))), []);
});

test('T1 loop guard: a line repeated three times and a phrase looping four times are loops', () => {
  const lines = modelDefects([{ messageId: 51, speaker: 'Kanna', text: 'The front holds.\nThe banners are still.\nThe front holds.\nShe waits.\nThe front holds.' }]);
  assert.equal(lines.length, 1);
  assert.deepEqual({ kind: lines[0].kind, messageId: lines[0].messageId, rule: lines[0].rule }, { kind: 'loop', messageId: 51, rule: 'a line repeated 3 times' });
  assert.match(lines[0].sample, /The front holds\. \(x3\)/);
  const phrase = modelDefects([{ messageId: 28, text: 'Her eyes were hard as river stones, her voice hard as river stones; the men stood hard as river stones while the walls, hard as river stones, waited.' }]);
  assert.deepEqual(phrase.map((defect) => [defect.kind, defect.sample]), [['loop', 'hard as river stones (x4)']]);
  assert.deepEqual(modelDefects([{ messageId: 1, text: 'The front holds. The front holds.' }]), [], 'twice is not a loop');
});

test('T1 loop guard: word-merge damage is corrupt (glued function words, bad contractions, spelled letters, doubled words)', () => {
  const cases: Array<[string, string]> = [
    ['She looks at theis the gate and frowns.', 'glued function words'],
    ['"Fine, this\'ve been a long road," he says.', 'bad contraction'],
    ['The sign reads L-I-L-E in faded paint.', 'spelled letters'],
    ['Her face was pale pale under the lantern.', 'doubled word'],
    ['He walked and and stopped.', 'doubled word'],
  ];
  for (const [text, rule] of cases) {
    const found = modelDefects([{ messageId: 23, speaker: 'Belle', text }]);
    assert.deepEqual(found.map((defect) => [defect.kind, defect.rule]), [['corrupt', rule]], text);
  }
});

test('T1 loop guard: defect counts per session', () => {
  const loop = { kind: 'loop' as const, messageId: 1, speaker: null, sample: 's', rule: 'r' };
  const corrupt = { ...loop, kind: 'corrupt' as const };
  assert.deepEqual(defectCounts([{ modelDefects: [] }, { modelDefects: [loop, corrupt], autoRepair: { swiped: true } }, { modelDefects: [corrupt], autoRepair: { swiped: false } }, {}]), { turns: 2, loop: 1, corrupt: 2, repaired: 1, unrepaired: 0 });
});

test('T4-3-3 loop guard: a word repeated across an apostrophe is not a doubled word', () => {
  const replies = ["I'll tell you you're an idiot.", "She said it's its own reward."];
  assert.deepEqual(modelDefects(replies.map((text, index) => ({ messageId: index, text }))), []);
  assert.deepEqual(modelDefects([{ messageId: 9, text: 'He walked and and stopped.' }]).map((defect) => defect.rule), ['doubled word']);
});

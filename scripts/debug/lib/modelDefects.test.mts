import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defectCounts, EMPTY_RULE, LEAK_RULES, modelDefects } from './modelDefects.mts';

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
  const start = { ...loop, kind: 'start' as const };
  const leak = { ...loop, kind: 'leak' as const };
  assert.deepEqual(defectCounts([{ modelDefects: [] }, { modelDefects: [loop, corrupt], autoRepair: { swiped: true } }, { modelDefects: [corrupt, start, leak], autoRepair: { swiped: false } }, {}]), { turns: 2, loop: 1, corrupt: 2, start: 1, empty: 0, leak: 1, repaired: 1, unrepaired: 0 });
});

test('T5-5-1 damaged start: a repeated speaker prefix and a reply opening on the eaten tail of the speaker\'s name are defects', () => {
  const t551: Array<[number, string, string]> = [
    [4, 'Forre: *Forre glances at the token, then up at Max Nightriver, his emerald eyes sharp and appraising.* "My father\'s dagger," *he says.*', 'repeated speaker prefix'],
    [6, 'rre\'s eyebrow arches, a faint smile playing at his lips that doesn\'t quite reach his emerald eyes.*\n"How quaint."', 'truncated speaker name'],
    [8, 're: "A wise decision."*He produces a piece of parchment from his doublet.', 'truncated speaker name'],
  ];
  for (const [messageId, text, rule] of t551) {
    assert.deepEqual(modelDefects([{ messageId, speaker: 'Forre', text }]).map((defect) => [defect.kind, defect.messageId, defect.speaker, defect.rule]), [['start', messageId, 'Forre', rule]], text);
  }
  assert.deepEqual(modelDefects([{ messageId: 3, speaker: 'Adolion Narrator', text: '  Adolion Narrator : The tent smells of wool.' }]).map((defect) => defect.rule), ['repeated speaker prefix']);
  assert.deepEqual(modelDefects([{ messageId: 3, speaker: 'Adolion Narrator', text: 'tor\'s voice carries over the guns.' }]).map((defect) => defect.rule), ['truncated speaker name']);
  assert.match(modelDefects([{ messageId: 6, speaker: 'Forre', text: t551[1][1] }])[0].sample, /^rre's eyebrow arches/);
});

test('T5-5-1 damaged start: controls (clean starts, other names, possessives, a speaker-less reply) are not defects', () => {
  const clean: Array<[string, string]> = [
    ['Forre', '*Forre glances at the token.* "My father\'s dagger."'],
    ['Forre', 'Forre\'s smile thins, the expression not reaching his eyes.'],
    ['Forre', '"Take your time," *Forre says.*\nForre: a line later in the reply is not the start'],
    ['Forre', 'Alexander: "No." The king answers first.'],
    ['Forre', 'rest is for the weary, he thinks.'],
    ['Forre', 'reaching the map, he stops: the token has moved.'],
    ['Alexander', '"The Cursefire Regiment holds Greywater with a grip of iron."'],
    ['Kanna', 'Anna\'s letter lies on the table.'],
    ['Adolion Narrator', '*The command tent smells of old leather and unwashed wool.*'],
  ];
  assert.deepEqual(modelDefects(clean.map(([speaker, text], index) => ({ messageId: index, speaker, text }))), []);
  assert.deepEqual(modelDefects([{ messageId: 1, text: 'Forre: no speaker given, nothing to compare.' }, { messageId: 2, speaker: null, text: 're: "A wise decision."' }]), []);
});

test('T4-3-3 loop guard: a word repeated across an apostrophe is not a doubled word', () => {
  const replies = ["I'll tell you you're an idiot.", "She said it's its own reward."];
  assert.deepEqual(modelDefects(replies.map((text, index) => ({ messageId: index, text }))), []);
  assert.deepEqual(modelDefects([{ messageId: 9, text: 'He walked and and stopped.' }]).map((defect) => defect.rule), ['doubled word']);
});

test('T5-1-1 empty: blank or whitespace text is one empty defect and nothing else; text with reasoning beside it is not', () => {
  assert.deepEqual(modelDefects([{ messageId: 17, speaker: 'Master Ilse', text: ' \n ', reasoningLength: 5487 }]).map((defect) => [defect.kind, defect.messageId, defect.sample, defect.rule]), [['empty', 17, '(no text; 5487 chars of reasoning)', EMPTY_RULE]]);
  assert.equal(modelDefects([{ messageId: 2, text: '' }])[0].sample, '(no text)');
  assert.deepEqual(modelDefects([{ messageId: 3, speaker: 'Master Ilse', text: 'She sets the rule down.', reasoningLength: 900 }]), []);
});

test('T6-3-3 leak: reasoning in the visible reply (a thought marker, a planning bullet, an orphan quote+comma opening) is a defect', () => {
  const cases: Array<[string, string]> = [
    ['"line", *action*\n    *   Keep the scene on the door.\n    *   No lines for the player.<channel|>*The old clerk bolts the door.* "Sit."', LEAK_RULES.marker],
    ['*The clerk turns.* "Sit down."<|channel>thought\nplan the next beat', LEAK_RULES.marker],
    ['Plan done.</think>*She waits.*', LEAK_RULES.marker],
    ['"line", *The envoy\'s voice stays level.* "Consider the ledger an invitation."', LEAK_RULES.orphan],
    ['*He nods.*\n    *   Third person.\n    *   End on a move.\n*He leaves.*', LEAK_RULES.bullets],
  ];
  for (const [text, rule] of cases) {
    const found = modelDefects([{ messageId: 14, speaker: 'Master', text }]);
    assert.deepEqual(found.filter((defect) => defect.kind === 'leak').map((defect) => [defect.messageId, defect.rule]), [[14, rule]], text);
  }
});

test('T6-3-3 leak: controls (ordinary quotes, a comma inside the quote, action asterisks, a dash list in prose) are not leaks', () => {
  const clean = [
    '"Take your time," *the clerk says.* "The ink will wait."',
    '*She sets the pen down.* "No."',
    '"Wait." *He raises a hand.* "Listen, the bells."',
    'The list on the wall reads:\n- bread\n- salt',
    '*The door creaks.*\n*Rain on the shutters.*',
  ];
  assert.deepEqual(modelDefects(clean.map((text, index) => ({ messageId: index, speaker: 'Master', text }))), []);
});

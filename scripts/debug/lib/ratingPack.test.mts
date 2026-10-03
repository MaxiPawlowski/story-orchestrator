import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armRefusal, buildPack, candidatesFromTurns, gateStatus, GATE_SPECS, packCandidates, packLeaks, PACK_SESSION_RULE, premiseKey, rowArm, sessionCandidates, storyCandidate } from './ratingPack.mts';

const context = [{ id: 1, name: 'Kela', text: 'We march at dawn.' }, { id: 2, name: 'You', text: 'Why the hurry?' }];
const rows = [
  { line: 1, value: { kind: 'turn', ok: true, arm: 'beat', chatId: 'c1', replies: [{ messageId: 3, speaker: 'Kela', text: 'Because the wall falls tonight.' }], observe: { context } } },
  { line: 2, value: { kind: 'mutation', verb: 'swipe-new', ok: true, arm: 'plain', chatId: 'c1', did: { messageId: 3 }, tail: [{ messageId: 3, isUser: false, text: 'Dawn is when we march.' }], observe: { context } } },
  { line: 3, value: { kind: 'turn', ok: true, arm: 'beat', chatId: 'c1', replies: [{ messageId: 5, text: 'unpaired' }], observe: { context } } },
  { line: 4, value: { kind: 'turn', ok: true, chatId: 'c1', replies: [{ messageId: 7, text: 'no arm' }] } },
];

test('AS-28 rating pack: arm-tagged turns and swipes on the same message become one pair', () => {
  const candidates = candidatesFromTurns('C3', rows, 'test/sessions/T3/T3-1-1');
  assert.equal(candidates.length, 3);
  const pack = buildPack('C3', candidates, 'seed');
  assert.equal(pack.pairs.length, 1);
  assert.equal(pack.unmatched, 1);
  assert.deepEqual(new Set([pack.pairs[0].left.text, pack.pairs[0].right.text]), new Set(['Because the wall falls tonight.', 'Dawn is when we march.']));
  assert.deepEqual(pack.pairs[0].context.map((line) => line.text), ['We march at dawn.', 'Why the hurry?']);
});

test('AS-28 rating pack: pairs are unlabelled, the key is separate, and the order is shuffled reproducibly', () => {
  const many = Array.from({ length: 12 }, (_, at) => [
    { gate: 'C3' as const, arm: 'beat', key: `c:${at}`, context: [], text: `beat ${at}`, source: `s:${at}a` },
    { gate: 'C3' as const, arm: 'plain', key: `c:${at}`, context: [], text: `plain ${at}`, source: `s:${at}b` },
  ]).flat();
  const one = buildPack('C3', many, 'seed-1');
  const again = buildPack('C3', many, 'seed-1');
  const other = buildPack('C3', many, 'seed-2');
  assert.deepEqual(one.pairs, again.pairs);
  assert.notDeepEqual(one.pairs.map((pair) => pair.id), other.pairs.map((pair) => pair.id));
  assert.deepEqual(packLeaks(one.pairs), []);
  assert.ok(one.key.some((row) => row.left === 'beat') && one.key.some((row) => row.left === 'plain'), 'both sides must carry each arm somewhere');
  assert.notDeepEqual(one.pairs.map((pair) => pair.left.text.split(' ')[1]), one.pairs.map((_, at) => String(at)), 'the pairs are not in session order');
  assert.deepEqual(packLeaks([{ ...one.pairs[0], left: { text: 'x', arm: 'beat' } as any }]).length, 1);
});

test('AS-28 rating pack: the human verdict is reserved and the gate stays pending, even after a rebuild', () => {
  const candidates = candidatesFromTurns('C3', rows, 'd');
  const first = buildPack('C3', candidates, 'seed');
  assert.deepEqual(first.verdicts.map((verdict) => verdict.preferred), [null]);
  assert.equal(first.status.status, 'pending');
  const rated = [{ ...first.verdicts[0], preferred: 'left' as const, rater: 'user' }];
  const rebuilt = buildPack('C3', candidates, 'seed', rated);
  assert.deepEqual(rebuilt.verdicts, rated, 'a rebuild keeps the verdicts already given');
  assert.equal(rebuilt.status.status, 'pending');
  assert.match(rebuilt.status.reason, /1 of the 30 pairs/);
  const full = Array.from({ length: GATE_SPECS.C3.pairsNeeded }, (_, at) => ({ id: `p${at}`, preferred: 'left' as const, rater: 'user', note: '' }));
  assert.equal(gateStatus('C3', full).status, 'pending');
});

test('AS-28 rating pack: wizard stories pair by premise for W6', () => {
  const story = { title: 'Tide', description: 'A courier', checkpoints: [{ id: 'a', name: 'Docks', objective: 'cross' }], roster: [{ name: 'Courier' }] };
  const agent = storyCandidate('W6', 'agent', 'premise-1', story, 's1')!;
  const staged = storyCandidate('W6', 'staged', 'premise-1', { ...story, title: 'Tide II' }, 's2')!;
  assert.match(agent.text, /1\. Docks: cross/);
  assert.equal(buildPack('W6', [agent, staged], 'x').pairs.length, 1);
  assert.equal(storyCandidate('W6', 'agent', 'p', null, 's'), null);
});

test('T5-1-1 arm rule: an armed session owns every generated turn, untagged or not, and a foreign arm never counts', () => {
  const untagged = rows.map(({ line, value }) => ({ line, value: { ...value, arm: undefined } }));
  assert.equal(candidatesFromTurns('C3', untagged, 'd').length, 0);
  assert.equal(candidatesFromTurns('C3', untagged, 'd', 'plain').length, 4);
  assert.ok(candidatesFromTurns('C3', rows, 'd', 'plain').every((candidate) => candidate.arm === 'plain'));
  assert.equal(rowArm({ kind: 'flag', arm: 'beat' }, 'beat'), null);
  assert.equal(rowArm({ kind: 'mutation', verb: 'swipe-new' }, 'beat'), 'beat');
  assert.equal(rowArm({ kind: 'mutation', verb: 'delete' }, 'beat'), null);
  assert.equal(sessionCandidates('C3', { session: { arm: 'agent' }, turns: rows, drafts: null, sessionDir: 'd' }).length, 0);
});

test('T5-1-1 arm rule: W6 counts the armed session story, keyed by premise, never its turns', () => {
  const story = { title: 'Redline', checkpoints: [{ id: 'a', name: 'Ink', objective: 'draw' }], roster: [] };
  const session = { charter: 'T5-1', arm: 'agent', story: { kind: 'wizard', premiseId: 'cartographer' } };
  const found = sessionCandidates('W6', { session, turns: rows, drafts: { openDraft: story }, sessionDir: 'd' });
  assert.deepEqual(found.map((candidate) => [candidate.arm, candidate.key, candidate.source]), [['agent', 'cartographer', 'd/wizard-drafts.json']]);
  assert.equal(premiseKey({ charter: 'T5-1' }), 'T5-1');
  assert.deepEqual(sessionCandidates('W6', { session: { ...session, arm: null }, turns: rows, drafts: { openDraft: story }, sessionDir: 'd' }), []);
  assert.deepEqual(sessionCandidates('W6', { session, turns: rows, drafts: { openDraft: null }, sessionDir: 'd' }), []);
});

test('T5-1-1 arm rule: start refuses an arm the card cannot pair', () => {
  assert.equal(armRefusal(['W6'], 'agent'), null);
  assert.equal(armRefusal(['W6'], null), null);
  assert.match(armRefusal(['W6'], 'beat')!, /not an arm of W6 \(agent, staged\)/);
  assert.match(armRefusal([], 'agent')!, /feeds no blind gate/);
});

test('T5-1 re-run: W6 pairs only VALID sessions, the latest valid one per arm and premise', () => {
  const story = (title: string) => ({ title, description: 'd', checkpoints: [{ id: 'a', name: 'A', objective: 'o' }], roster: [] });
  const entry = (dir: string, arm: string, valid: boolean, stoppedAt: string, title: string) => {
    const session = { charter: 'T5-1', arm, valid, stoppedAt, story: { premiseId: 'cartographer' } };
    return { dir, session, candidates: sessionCandidates('W6', { session, turns: [], drafts: { openDraft: story(title) }, sessionDir: dir }) };
  };
  const picked = packCandidates([
    entry('T5/T5-1-1', 'agent', false, '2026-10-02T11:54:13.677Z', 'Invalid agent run'),
    entry('T5/T5-1-2', 'staged', true, '2026-10-02T12:30:00.000Z', 'Older staged run'),
    entry('T5/T5-1-3', 'agent', true, '2026-10-02T15:03:21.125Z', 'The Redrawn Kingdom'),
    entry('T5/T5-1-4', 'staged', true, '2026-10-02T15:54:13.210Z', 'The Redrawing Map'),
  ]);
  assert.deepEqual(picked.skippedInvalid, ['T5/T5-1-1']);
  assert.deepEqual(picked.superseded, ['T5/T5-1-2/wizard-drafts.json']);
  assert.deepEqual(picked.candidates.map((candidate) => candidate.source).sort(), ['T5/T5-1-3/wizard-drafts.json', 'T5/T5-1-4/wizard-drafts.json']);
  const pack = buildPack('W6', picked.candidates, 'x');
  assert.equal(pack.pairs.length, 1);
  assert.deepEqual(pack.key[0].sources.left === 'T5/T5-1-3/wizard-drafts.json' ? pack.key[0].sources.right : pack.key[0].sources.left, 'T5/T5-1-4/wizard-drafts.json');
  assert.match(PACK_SESSION_RULE, /VALID/);
  const none = packCandidates([entry('T5/T5-1-1', 'agent', false, '2026-10-02T11:54:13.677Z', 'Invalid agent run')]);
  assert.deepEqual(none.candidates, []);
});

test('T6-1 R4: a round with several replies pairs the reply swipe-new acted on, by message id', () => {
  const round = [
    { line: 1, value: { kind: 'turn', ok: true, chatId: 'c9', replies: [{ messageId: 4, speaker: 'Kela', text: 'First voice.' }, { messageId: 5, speaker: 'Oren', text: 'Last voice, plain.' }], observe: { context: [...context, { id: 4, name: 'Kela', text: 'First voice.' }] } } },
    { line: 2, value: { kind: 'mutation', verb: 'swipe-new', ok: true, chatId: 'c9', did: { messageId: 5 }, tail: [{ messageId: 4, isUser: false, text: 'First voice.' }, { messageId: 5, isUser: false, text: 'Last voice, reasoned.' }, { messageId: 6, isUser: false, text: 'a note after it' }], observe: { context } } },
  ];
  const plain = candidatesFromTurns('R4', [round[0]], 'd', 'plain');
  const reasoned = candidatesFromTurns('R4', [round[1]], 'd', 'reasoning');
  assert.deepEqual(plain.map((candidate) => [candidate.key, candidate.text]), [['c9:5', 'Last voice, plain.']]);
  assert.deepEqual(reasoned.map((candidate) => [candidate.key, candidate.text]), [['c9:5', 'Last voice, reasoned.']]);
  assert.deepEqual(plain[0].context.map((line) => line.text), ['We march at dawn.', 'Why the hurry?', 'First voice.']);
  const pack = buildPack('R4', [...plain, ...reasoned], 'seed');
  assert.equal(pack.pairs.length, 1);
  assert.equal(pack.unmatched, 0);
  assert.deepEqual(new Set([pack.pairs[0].left.text, pack.pairs[0].right.text]), new Set(['Last voice, plain.', 'Last voice, reasoned.']));
});

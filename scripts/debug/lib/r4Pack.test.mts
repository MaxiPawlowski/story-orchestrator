import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './connection.mts';
import {
  assertFrozen, buildPack, freezeTurns, packDigest, packLeaks, pairProblems, payloadProof, R4_FLOOR, scoreRatings, seededRandom, shuffled, turnsDigest, turnsProblems,
  type R4Generation, type R4Key, type R4Pack, type R4Ratings, type R4TurnRecord, type R4TurnsFile,
} from './r4Pack.mts';

export const fixtureTurns = (count = 20): R4TurnsFile => ({
  plan: 'p',
  step: 'R4',
  arm: 'high',
  frozenSha256: null,
  turns: Array.from({ length: count }, (_value, index) => ({
    id: `t${String(index + 1).padStart(2, '0')}`,
    story: index < count / 2 ? 'Story A' : 'Story B',
    storyId: index < count / 2 ? 'story-a' : 'story-b',
    checkpoint: 'climax',
    chatId: `chat-${index + 1}`,
    member: null,
    contextMessages: 4,
  })),
});

const proof = (source: string, value: unknown) => (source === 'custom'
  ? payloadProof({ chat_completion_source: 'custom', include_reasoning: value === 'high', custom_include_body: JSON.stringify({ chat_template_kwargs: { enable_thinking: value === 'high' } }) })
  : payloadProof({ chat_completion_source: source, reasoning_effort: value, include_reasoning: value === 'high' }));

const generation = (side: 'arm' | 'control', reply: string, latencyMs: number, source = 'openrouter', value: unknown = side === 'arm' ? 'high' : undefined): R4Generation => ({
  side, order: side === 'arm' ? 0 : 1, reply, speaker: 'Narrator', latencyMs, payload: proof(source, value), shot: null,
});

export const fixtureRecord = (turnId: string, patch: Partial<Record<'arm' | 'control', Partial<R4Generation>>> = {}): R4TurnRecord => ({
  turnId,
  context: [{ name: 'Player', text: `I step forward (${turnId.length} steps).` }, { name: 'Narrator', text: 'The gate groans.' }],
  generations: [
    { ...generation('control', `The control reply number ${turnId.slice(1)}.`, 1000), ...patch.control },
    { ...generation('arm', `A slower considered reply ${turnId.slice(1)}.`, 1500), ...patch.arm },
  ],
});

const records = (count = 20) => fixtureTurns(count).turns.map((turn) => fixtureRecord(turn.id));
const turnIds = (count = 20) => fixtureTurns(count).turns.map((turn) => turn.id);

const built = (count = 20, seed = 'seed-1') => buildPack(records(count), { seed, runId: 'run', turnsSha256: 'sha-turns' });

const rateAll = (pack: R4Pack, key: R4Key, armWins: number, ties = 0): R4Ratings => ({
  packSha256: key.packSha256,
  ratings: pack.items.map((item, index) => {
    if (index < armWins) return { item: item.id, prefer: key.items[item.id].a === 'arm' ? 'A' : 'B' };
    if (index < armWins + ties) return { item: item.id, prefer: 'tie' };
    return { item: item.id, prefer: key.items[item.id].a === 'arm' ? 'B' : 'A' };
  }),
});

test('freeze refuses placeholders, a wrong count and a wrong arm; a frozen file verifies and a changed one does not', () => {
  const holes = { ...fixtureTurns(), turns: fixtureTurns().turns.map((turn, index) => (index === 3 ? { ...turn, chatId: '<prepared chat>' } : turn)) };
  assert.throws(() => freezeTurns(holes), /placeholder not filled in: turns\[3\]\.chatId/);
  assert.deepEqual(turnsProblems(fixtureTurns(19)), ['19 turns declared, the recipe needs 20']);
  assert.deepEqual(turnsProblems({ ...fixtureTurns(), arm: 'medium' }), ['the arm must be "high", got "medium"']);
  const oneStory = { ...fixtureTurns(), turns: fixtureTurns().turns.map((turn) => ({ ...turn, storyId: 'story-a' })) };
  assert.deepEqual(turnsProblems(oneStory), ['1 stories declared, the recipe needs 2']);
  const frozen = freezeTurns(fixtureTurns());
  assert.equal(assertFrozen(frozen), turnsDigest(fixtureTurns()));
  assert.throws(() => assertFrozen(fixtureTurns()), /not frozen as recorded \(frozenSha256 null/);
  const edited = { ...frozen, turns: frozen.turns.map((turn, index) => (index === 0 ? { ...turn, contextMessages: 6 } : turn)) };
  assert.throws(() => assertFrozen(edited), /not frozen as recorded/);
});

test('the committed turns file is the declared shape with only its placeholders left to fill', () => {
  const file = JSON.parse(readFileSync(join(PROJECT_ROOT, 'test', 'measurements', 'v2.6-05', 'r4-turns.json'), 'utf-8')) as R4TurnsFile;
  const problems = turnsProblems(file);
  assert.ok(problems.length > 0);
  assert.deepEqual(problems.filter((problem) => !problem.startsWith('placeholder not filled in')), []);
  assert.equal(file.turns.length, 20);
  assert.equal(file.frozenSha256, null);
  assert.throws(() => assertFrozen(file), /not ready/);
});

test('a pair is valid only when the arm key landed and the control did not carry it', () => {
  assert.deepEqual(pairProblems(fixtureRecord('t01')), []);
  assert.deepEqual(pairProblems({ ...fixtureRecord('t01'), generations: [generation('control', 'x', 10, 'custom', false), generation('arm', 'y', 10, 'custom', 'high')] }), []);
  assert.match(pairProblems(fixtureRecord('t01', { arm: { payload: proof('openrouter', undefined) } })).join(';'), /the arm key did not land/);
  assert.match(pairProblems(fixtureRecord('t01', { arm: { payload: proof('custom', 'off') } })).join(';'), /the arm key did not land/);
  assert.match(pairProblems(fixtureRecord('t01', { arm: { payload: payloadProof(null) } })).join(';'), /no request was captured for the arm/);
  assert.match(pairProblems(fixtureRecord('t01', { control: { payload: proof('openrouter', 'high') } })).join(';'), /already carries the arm's value/);
  assert.match(pairProblems(fixtureRecord('t01', { control: { reply: '  ' } })).join(';'), /control reply is empty/);
  assert.match(pairProblems(fixtureRecord('t01', { arm: { payload: proof('custom', 'high') } })).join(';'), /different sources/);
});

test('control: enable_thinking is read from a YAML include body the profile wrote', () => {
  assert.equal(payloadProof({ chat_completion_source: 'custom', custom_include_body: 'chat_template_kwargs:\n  enable_thinking: false' }).enableThinking, false);
});

test('a planted run whose arm key did not land is excluded from the pack and named in the key', () => {
  const planted = records(21);
  planted[4] = fixtureRecord(planted[4].turnId, { arm: { payload: proof('openrouter', undefined) } });
  const { pack, key } = buildPack(planted, { seed: 's', runId: 'r', turnsSha256: 't' });
  assert.equal(pack.items.length, 20);
  assert.deepEqual(key.excluded.map((entry) => entry.turnId), ['t05']);
  assert.ok(!Object.values(key.items).some((item) => item.turnId === 't05'));
});

test('the pack is shuffled, balanced, opaque and reproducible from its seed; a clean pack has no leaks', () => {
  const { pack, key } = built();
  assert.deepEqual(packLeaks(pack, key, turnIds()), []);
  assert.equal(pack.items.filter((item) => key.items[item.id].a === 'arm').length, 10);
  assert.ok(pack.items.every((item) => /^r4-\d{2}$/.test(item.id)));
  assert.deepEqual(Object.keys(pack.items[0]).sort(), ['context', 'id', 'replyA', 'replyB']);
  assert.ok(!JSON.stringify(pack).includes('seed-1'));
  assert.equal(built().key.packSha256, key.packSha256);
  assert.notEqual(built(20, 'seed-2').key.packSha256, key.packSha256);
  assert.equal(key.packSha256, packDigest(pack));
});

test('leak check: an arm label or a reasoning trace in the item text fails', () => {
  for (const text of ['[arm] he draws his blade', 'control: the gate opens', 'reasoning_effort was high', '<think>plan the fight</think> He strikes.']) {
    const { pack, key } = built();
    pack.items[2] = { ...pack.items[2], replyB: text };
    assert.ok(packLeaks(pack, key, turnIds()).some((leak) => leak.startsWith(`${pack.items[2].id}: text matches`)), text);
  }
  const { pack, key } = built();
  pack.items[0] = { ...pack.items[0], replyA: 'He raised his arm and took control of the high wall.' };
  assert.deepEqual(packLeaks(pack, key, turnIds()), []);
});

test('leak check: the key ordering must not let position predict the arm', () => {
  const { pack, key } = built();
  const allArmA = { ...key, items: Object.fromEntries(Object.entries(key.items).map(([id, item]) => [id, { ...item, a: 'arm' as const, b: 'control' as const }])) };
  assert.ok(packLeaks(pack, allArmA, turnIds()).some((leak) => /reply A in 20 of 20/.test(leak)));
  const alternating = { ...key, items: Object.fromEntries(pack.items.map((item, index) => [item.id, { ...key.items[item.id], a: (index % 2 ? 'arm' : 'control') as 'arm' | 'control', b: (index % 2 ? 'control' : 'arm') as 'arm' | 'control' }])) };
  assert.ok(packLeaks(pack, alternating, turnIds()).some((leak) => /alternates/.test(leak)));
  const inOrder = { ...key, items: Object.fromEntries(pack.items.map((item, index) => [item.id, { ...key.items[item.id], turnId: turnIds()[index] }])) };
  assert.ok(packLeaks(pack, inOrder, turnIds()).some((leak) => /declared turn order/.test(leak)));
});

test('leak check: extra fields, non-opaque ids and the seed in the pack fail', () => {
  const { pack, key } = built();
  const extra = { ...pack, items: pack.items.map((item, index) => (index === 1 ? { ...item, side: 'arm' } : item)) } as R4Pack;
  assert.ok(packLeaks(extra, key, turnIds()).some((leak) => /beyond the blind shape \(side\)/.test(leak)));
  const named = { ...pack, items: pack.items.map((item, index) => (index === 1 ? { ...item, id: 't07' } : item)) };
  assert.ok(packLeaks(named, { ...key, items: { ...key.items, t07: key.items[pack.items[1].id] } }, turnIds()).some((leak) => /not an opaque r4-NN id/.test(leak)));
  const seeded = { ...pack, question: `${pack.question} ${key.seed}` };
  assert.ok(packLeaks(seeded, key, turnIds()).includes('the pack carries the seed'));
});

test('seeded shuffle is deterministic and a permutation', () => {
  const items = Array.from({ length: 20 }, (_value, index) => index);
  assert.deepEqual(shuffled(items, seededRandom('x')), shuffled(items, seededRandom('x')));
  assert.deepEqual([...shuffled(items, seededRandom('x'))].sort((a, b) => a - b), items);
  assert.notDeepEqual(shuffled(items, seededRandom('x')), items);
});

test('floor: 12 of 20 arm wins with p95 at exactly 2x passes', () => {
  const { pack, key } = built();
  const tuned = { ...key, latencyMs: { control: Array(20).fill(1000), arm: Array(20).fill(2000) } };
  const score = scoreRatings({ pack, key: tuned, ratings: rateAll(pack, tuned, 12), turnsSha256: 'sha-turns', minItems: 20 });
  assert.deepEqual([score.ok, score.armPreferred, score.preferredShare, score.p95Ratio], [true, 12, 0.6, 2]);
  assert.equal(score.floor, R4_FLOOR);
});

test('floor: 11 of 20 fails on preference; ties count against the arm', () => {
  const { pack, key } = built();
  const below = scoreRatings({ pack, key, ratings: rateAll(pack, key, 11), turnsSha256: 'sha-turns', minItems: 20 });
  assert.equal(below.ok, false);
  assert.match(below.failures.join(';'), /arm preferred in 11 of 20 \(55\.0%\), floor 60%/);
  const tied = scoreRatings({ pack, key, ratings: rateAll(pack, key, 11, 9), turnsSha256: 'sha-turns', minItems: 20 });
  assert.deepEqual([tied.ok, tied.ties, tied.controlPreferred], [false, 9, 0]);
});

test('floor: p95 just over 2x fails even when the arm is always preferred', () => {
  const { pack, key } = built();
  const slow = { ...key, latencyMs: { control: Array(20).fill(1000), arm: Array(20).fill(2010) } };
  const score = scoreRatings({ pack, key: slow, ratings: rateAll(pack, slow, 20), turnsSha256: 'sha-turns', minItems: 20 });
  assert.equal(score.ok, false);
  assert.match(score.failures.join(';'), /arm p95 is 2\.01x the control, floor 2x/);
});

test('floor: fewer valid pairs than declared fails however good the share', () => {
  const { pack, key } = built(18);
  const score = scoreRatings({ pack, key, ratings: rateAll(pack, key, 18), turnsSha256: 'sha-turns', minItems: 20 });
  assert.equal(score.ok, false);
  assert.match(score.failures.join(';'), /18 valid rated pairs, the floor is declared on 20/);
});

test('score refuses unknown, duplicate, invalid and missing items, and a pack or turns file that changed', () => {
  const { pack, key } = built();
  const good = rateAll(pack, key, 15);
  const refuse = (ratings: R4Ratings, re: RegExp, over: Partial<{ pack: R4Pack; turnsSha256: string }> = {}) =>
    assert.throws(() => scoreRatings({ pack: over.pack ?? pack, key, ratings, turnsSha256: over.turnsSha256 ?? 'sha-turns', minItems: 20 }), re);
  refuse({ ...good, ratings: [...good.ratings, { item: 'r4-99', prefer: 'A' }] }, /unknown item "r4-99"/);
  refuse({ ...good, ratings: [...good.ratings, good.ratings[0]] }, /rated twice/);
  refuse({ ...good, ratings: good.ratings.map((row, index) => (index === 0 ? { ...row, prefer: 'arm' as never } : row)) }, /no valid preference/);
  refuse({ ...good, ratings: good.ratings.slice(1) }, /unrated items: r4-/);
  refuse({ ...good, packSha256: 'other' }, /made against another pack/);
  refuse(good, /the turns file changed since the pack was built/, { turnsSha256: 'edited' });
  refuse(good, /the pack changed since it was sealed/, { pack: { ...pack, items: pack.items.map((item, index) => (index ? item : { ...item, replyA: 'swapped' })) } });
  assert.equal(scoreRatings({ pack, key, ratings: good, turnsSha256: 'sha-turns', minItems: 20 }).armPreferred, 15);
});

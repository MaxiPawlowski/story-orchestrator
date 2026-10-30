import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cardArtPlan, cardArtProblems, cardTextProblems, laneServerLog, leakNames, markServerLog, takeServerLog, SHOWCASE_AVATARS } from './pocCardArt.mts';
import { journeyCast, poseCast } from './pocDrivers.mts';
import { testTempDirSync } from '../../lib/testTemp.mjs';

test('cardArtPlan gives each member one showcase avatar in cast order and refuses a fourth member', () => {
  const plan = cardArtPlan(journeyCast(), 'C:/art');
  assert.deepEqual(plan.map((row) => row.name), journeyCast().map((member) => member.name));
  assert.deepEqual(plan.map((row) => row.file), SHOWCASE_AVATARS.map((file) => resolve('C:/art', file)));
  assert.equal(new Set(cardArtPlan(poseCast(), 'C:/art').map((row) => row.file)).size, 3);
  assert.throws(() => cardArtPlan([...poseCast(), { name: 'SO-PL Extra' }]), /only 3 showcase avatars/);
});

test('C-H5: the p41 cast card text describes the showcase art each card is given, and a drifted text is named', () => {
  assert.deepEqual(cardTextProblems(journeyCast()), []);
  const drifted = journeyCast().map((member, at) => (at === 1 ? { ...member, description: 'Bram is a grey-bearded keeper in a knitted blue sweater.' } : member));
  assert.deepEqual(cardTextProblems(drifted), ['SO-P41 Bram: card text does not describe its showcase art garrick-avatar.png (missing black hair, plate armour, blue cape)']);
});

test('cardArtProblems names every card left on the default picture or not attached', () => {
  assert.deepEqual(cardArtProblems([{ name: 'A', file: 'a', avatar: 'a.png', ok: true }]), []);
  assert.deepEqual(cardArtProblems([
    { name: 'A', file: 'a', avatar: 'a.png', ok: false, reason: 'the served card picture is still the default picture' },
    { name: 'B', file: 'b', avatar: null, ok: false },
  ]), ['A: the served card picture is still the default picture', 'B: not attached']);
});

test('leakNames lists each leaked asset by kind and name', () => {
  const names = leakNames({
    characters: [{ name: 'SO-P41 Ash' }], groups: [{ name: 'SO-P41 Lighthouse' }], lorebooks: ['Story Orchestrator - SO-P41 x - 1'], personas: [],
    sprites: [{ character: 'SO-P41 Ash', set: 'lp_521e9e9b', label: 'neutral' } as any],
    spriteReferences: [{ name: 'ref1', unused: true, sha256: 'x', set: 'refpack_1', character: 'SO-P41 Bram', story: null }],
  });
  assert.deepEqual(names, ['character SO-P41 Ash', 'group SO-P41 Lighthouse', 'lorebook Story Orchestrator - SO-P41 x - 1', 'sprite SO-P41 Ash/lp_521e9e9b/neutral', 'sprite-ref ref1 (SO-P41 Bram/refpack_1)']);
  assert.deepEqual(leakNames({ characters: [], groups: [], lorebooks: [] }), []);
});

test('server log slice: only on a lane, and only the bytes written during the run', () => {
  const root = testTempDirSync('so-cardart-');
  const debug = join(root, 'debug');
  assert.equal(laneServerLog({}, debug), null);
  assert.equal(laneServerLog({ SO_LANE: '33' }, debug), resolve(root, 'server.log'));
  assert.deepEqual(takeServerLog(markServerLog({}, debug), root), { taken: false, reason: 'not a lane run (SO_LANE unset)' });
  writeFileSync(join(root, 'server.log'), 'before\n');
  const mark = markServerLog({ SO_LANE: '33' }, debug);
  appendFileSync(join(root, 'server.log'), 'during: API request failed\n');
  const out = testTempDirSync('so-cardart-out-');
  const slice = takeServerLog(mark, out);
  assert.equal(slice.taken, true);
  assert.equal(readFileSync(join(out, 'server.log'), 'utf8'), 'during: API request failed\n');
});

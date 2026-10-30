import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSet, parseCopyArgs, planCopy, rigAssetRel, rigRefsFor, summarize, wantedFolder } from './spriteCopy.mts';

test('sprite copy args: lane >= 1 required, dry run unless --confirm', () => {
  const dry = parseCopyArgs(['--lane', '38', '--members', 'Arin,Mira']);
  assert.deepEqual(dry.errors, []);
  assert.equal(dry.confirm, false);
  assert.equal(dry.set, 'so_presentation_v1');
  assert.deepEqual(dry.members, ['Arin', 'Mira']);
  assert.equal(parseCopyArgs(['--lane', '38', '--confirm']).confirm, true);
  assert.match(parseCopyArgs([]).errors.join(' '), /--lane/);
  assert.match(parseCopyArgs(['--lane', '0']).errors.join(' '), /never lane 0/);
  assert.match(parseCopyArgs(['--lane', '3', '--set', '../x']).errors.join(' '), /--set/);
});

test('only the prepared set, its front-try variants and their frame folders match', () => {
  for (const name of ['so_presentation_v1', 'so_presentation_v1b', 'anim-so_presentation_v1', 'anim-so_presentation_v1d']) assert.equal(matchesSet(name, 'so_presentation_v1'), true);
  for (const name of ['default', 'so_presentation_v10', 'so_presentation_v1e', 'lp_1234abcd', 'anim-lp_1234abcd']) assert.equal(matchesSet(name, 'so_presentation_v1'), false);
  assert.equal(wantedFolder('Arin', []), true);
  assert.equal(wantedFolder('arin', ['Arin']), true);
  assert.equal(wantedFolder('Mira', ['Arin']), false);
});

test('rig refs: local asset paths only, never a parent path; refs follow the copied set and folders', () => {
  assert.equal(rigAssetRel('/characters/Arin/so_presentation_v1/rig.json'), 'characters/Arin/so_presentation_v1/rig.json');
  assert.equal(rigAssetRel('/user/files/head%20one.json'), 'user/files/head one.json');
  assert.equal(rigAssetRel('/characters/../settings.json'), null);
  assert.equal(rigAssetRel('data:application/json,{}'), null);
  assert.equal(rigAssetRel('/backgrounds/x.png'), null);
  const ref = (member: string, look: string, folder: string) => ({ member, look, artHash: 'a'.repeat(64), source: `/characters/${folder}/${look}/neutral.png`, manifest: 'data:application/json,{}' });
  const refs = { a: ref('m1', 'so_presentation_v1', 'Arin'), b: ref('m2', 'so_presentation_v1', 'Mira'), c: ref('m1', 'lp_1234abcd', 'Arin') };
  assert.deepEqual(Object.keys(rigRefsFor(refs, 'so_presentation_v1', ['Arin'])), ['a']);
});

test('the plan copies only what the owner lacks: same bytes skip, different bytes are a conflict, never an overwrite', () => {
  const plan = planCopy([{ rel: 'a.png', size: 10, hash: 'h1' }, { rel: 'b.png', size: 20, hash: 'h2' }, { rel: 'c.png', size: 30, hash: 'h3' }],
    new Map([['b.png', 'h2'], ['c.png', 'other']]));
  assert.deepEqual(plan.map((entry) => entry.action), ['copy', 'same', 'conflict']);
  assert.deepEqual(summarize(plan), { copy: 1, same: 1, conflict: 1, bytes: 10 });
});

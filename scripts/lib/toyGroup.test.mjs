import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shellArg, TOY_GROUP_MEMBERS, TOY_GROUP_NAME, toyGroupCreateBody, toyGroupProblems } from './toyGroup.mjs';

const cards = [...TOY_GROUP_MEMBERS, 'Seliph.png'];

test('the toy group is pinned by name and created from its four cards', () => {
  assert.equal(TOY_GROUP_NAME, 'Group: Arin, DM Narrator');
  assert.doesNotMatch(TOY_GROUP_NAME, /^\d+$/);
  const body = toyGroupCreateBody();
  assert.equal(body.name, TOY_GROUP_NAME);
  assert.deepEqual(body.members, TOY_GROUP_MEMBERS);
  assert.deepEqual(body.disabled_members, []);
  body.members.push('x');
  assert.deepEqual(toyGroupCreateBody().members, TOY_GROUP_MEMBERS);
});

test('the seeder names what keeps the toy group from being there', () => {
  assert.deepEqual(toyGroupProblems([{ name: TOY_GROUP_NAME, members: TOY_GROUP_MEMBERS }], cards), []);
  assert.match(toyGroupProblems([], cards).join(), /is missing/);
  assert.match(toyGroupProblems([], ['Luke.png']).join(), /member card\(s\) missing: Ponticius\.png, Arin\.png, DM Narrator\.png/);
  assert.match(toyGroupProblems([{ name: TOY_GROUP_NAME, members: ['Luke.png'] }], cards).join(), /not a member: Ponticius\.png/);
  assert.match(toyGroupProblems([{ name: TOY_GROUP_NAME, members: TOY_GROUP_MEMBERS }, { name: TOY_GROUP_NAME, members: [] }], cards).join(), /2 groups carry the name/);
  assert.match(toyGroupProblems(null, null).join(), /member card/);
});

test('a group name is quoted for a command line, a plain token is not', () => {
  assert.equal(shellArg(TOY_GROUP_NAME), '"Group: Arin, DM Narrator"');
  assert.equal(shellArg('<id>'), '<id>');
  assert.equal(shellArg('g1'), 'g1');
  assert.equal(shellArg('a "b"'), '"a \\"b\\""');
});

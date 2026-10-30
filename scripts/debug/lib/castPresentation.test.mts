import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupProblems, parseCastArgs, pickMembers, type CleanupReport } from './castPresentation.mts';

test('cast presentation args: group required, set and steps checked, --cast refused, --front and --members read', () => {
  const ok = parseCastArgs(['--group', 'SO-UI-cast', '--members', 'Arin, Mira', '--only', 'base,rig', '--front', '--allow', 'inventory.stories']);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.group, 'SO-UI-cast');
  assert.deepEqual(ok.members, ['Arin', 'Mira']);
  assert.deepEqual([...(ok.only ?? [])], ['base', 'rig']);
  assert.equal(ok.front, true);
  assert.equal(ok.set, 'so_presentation_v1');
  assert.deepEqual(ok.allow, ['inventory.stories']);
  assert.match(parseCastArgs([]).errors.join(' '), /--group/);
  assert.match(parseCastArgs(['--group', 'g', '--cast', 'x.json']).errors.join(' '), /--cast is gone/);
  assert.match(parseCastArgs(['--group', 'g', '--set', 'Bad Set']).errors.join(' '), /--set/);
  assert.match(parseCastArgs(['--group', 'g', '--only', 'base,paint']).errors.join(' '), /paint/);
  assert.equal(parseCastArgs(['--help']).help, true);
});

test('members come from the group in its order; the filter is by name, case-insensitive, and names a missing member', () => {
  assert.deepEqual(pickMembers(['Arin', 'Mira', 'Scout'], []).cast, [{ id: 'm1', name: 'Arin' }, { id: 'm2', name: 'Mira' }, { id: 'm3', name: 'Scout' }]);
  assert.deepEqual(pickMembers(['Arin', 'Mira', 'Scout'], ['scout', 'Nobody']), { cast: [{ id: 'm3', name: 'Scout' }], missing: ['Nobody'] });
});

const clean: CleanupReport = {
  removed: { removed: true }, chats: { deleted: ['chat-1'], notDeleted: [] }, reapPrompts: { leaked: [] }, spriteSettings: { restored: true },
  differences: [{ path: 'inventory.stories', allowed: true }],
};

test('cleanup plan: a clean run has no problems; each leak is named', () => {
  assert.deepEqual(cleanupProblems(clean, 'chat-1'), []);
  assert.deepEqual(cleanupProblems({ ...clean, chats: { deleted: [], notDeleted: ['chat-1'] } }, 'chat-1'), ['sandbox chats left: chat-1', 'sandbox chat chat-1 was not deleted']);
  assert.deepEqual(cleanupProblems({ ...clean, reapPrompts: { leaked: ['chat-1'] } }, 'chat-1'), ['reap prompts left open: chat-1']);
  assert.deepEqual(cleanupProblems({ ...clean, spriteSettings: { restored: false, error: 'save 500' } }, 'chat-1'), ['sprite settings not restored: save 500']);
  assert.deepEqual(cleanupProblems({ ...clean, differences: [{ path: 'stories.so-cast-presentation' }] }, 'chat-1'), ['run header changed: stories.so-cast-presentation']);
  assert.deepEqual(cleanupProblems({ ...clean, removed: { error: 'gone' }, chats: { error: 'boom' }, differences: null }, null),
    ['workshop story not removed: gone', 'sandbox chat cleanup failed: boom', 'run header not diffed']);
});

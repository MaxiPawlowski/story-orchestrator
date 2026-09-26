import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedStoryHashes, blockingDialogFor, mergeRestore, removableStories, shouldRecoverConfig, validateJourneyExtraction } from './configRestore.mts';

test('a restore keeps a story and a wizard session another session created after the snapshot (S12)', () => {
  const snapshot = { settings: { cadence: 3 }, v2Stories: [{ id: 'mine' }], wizardSessions: [{ key: 'mine' }] };
  const live = { settings: { cadence: 1 }, v2Stories: [{ id: 'mine' }, { id: 'peer' }], wizardSessions: [{ key: 'mine' }, { key: 'peer-draft' }] };
  const { next, preservedStories, preservedSessions } = mergeRestore(snapshot, live);
  assert.deepEqual(next?.settings, { cadence: 3 });
  assert.deepEqual((next?.v2Stories as Array<{ id: string }>).map((story) => story.id), ['mine', 'peer']);
  assert.deepEqual((next?.wizardSessions as Array<{ key: string }>).map((session) => session.key), ['mine', 'peer-draft']);
  assert.deepEqual(preservedStories, ['peer']);
  assert.deepEqual(preservedSessions, ['peer-draft']);
});

test('a restore to "no config" stays a delete', () => {
  assert.equal(mergeRestore(null, { v2Stories: [{ id: 'x' }] }).next, null);
});

test('only stories this run introduced are removable, against a trusted capture', () => {
  assert.deepEqual(removableStories(['a', 'b', 'b'], { trusted: true, hashes: ['a'] }), { remove: ['b'], kept: ['a'], untrusted: false });
  assert.deepEqual(removableStories(['a'], ['a']), { remove: [], kept: ['a'], untrusted: false });
});

test('an untrusted or missing capture removes nothing, and keeps what it cannot account for (S6)', () => {
  assert.deepEqual(removableStories(['a', 'b'], { trusted: false, hashes: [] }), { remove: [], kept: ['a', 'b'], untrusted: true });
  assert.deepEqual(removableStories(['a'], null), { remove: [], kept: ['a'], untrusted: true });
});

test('setup recovers a crashed run only from an unrestored snapshot over a cleared root (S7)', () => {
  const crashed = { present: true, value: { settings: { profileId: 'p' }, v2Stories: [] } };
  assert.equal(shouldRecoverConfig([], crashed), true);
  assert.equal(shouldRecoverConfig(['settings'], crashed), true);
  assert.equal(shouldRecoverConfig(['settings', 'v2Stories'], crashed), false);
  assert.equal(shouldRecoverConfig([], { ...crashed, restoredAt: '2026-09-23T10:00:00Z' }), false);
  assert.equal(shouldRecoverConfig([], { present: true, value: {} }), false);
  assert.equal(shouldRecoverConfig([], { present: false, value: null }), false);
  assert.equal(shouldRecoverConfig([], null), false);
});

test('setup refuses the dialogs whose OK writes, and only those (S10)', () => {
  assert.match(blockingDialogFor('ERROR: Chat integrity check failed while saving the file.')?.why ?? '', /another writer/);
  assert.ok(blockingDialogFor('Welcome back — here is what happened'));
  assert.match(blockingDialogFor('This character has an embedded World/Lorebook. Would you like to import it now?')?.why ?? '', /imports a lorebook/);
  assert.equal(blockingDialogFor('Are you sure you want to restart the story?'), null);
});

test('every journey declares the extraction it runs at, and nothing else (§E)', () => {
  assert.deepEqual(validateJourneyExtraction({ extraction: { cadence: 1, stabilityLag: 0, profile: 'inherit' } }), []);
  assert.match(validateJourneyExtraction({}).join(), /setup\.extraction is required/);
  assert.match(validateJourneyExtraction({ cadence: 1, extraction: { cadence: 1, stabilityLag: 0, profile: 'inherit' } }).join(), /moved to setup\.extraction\.cadence/);
  assert.deepEqual(validateJourneyExtraction({ extraction: { cadence: 0, stabilityLag: -1, profile: 'Artemis', enabled: false } }), [
    'setup.extraction.enabled is not a declared setting',
    'setup.extraction.cadence must be an integer >= 1',
    'setup.extraction.stabilityLag must be an integer >= 0',
    'setup.extraction.profile must be "inherit"',
  ]);
});

test('A25: a refused import that still wrote a record is cleaned up, because the library diff names it', () => {
  const before = { trusted: true, hashes: ['user-story'] };
  const after = { trusted: true, hashes: ['user-story', 'refused-import'] };
  const tracked = addedStoryHashes(before, after);
  assert.deepEqual(tracked, ['refused-import']);
  assert.deepEqual(removableStories(tracked, before), { remove: ['refused-import'], kept: [], untrusted: false });
});

test('A25 control: tracking only the reported hash (none, for a refused import) leaves the record behind', () => {
  const before = { trusted: true, hashes: ['user-story'] };
  assert.deepEqual(removableStories([], before).remove, []);
});

test('A25: an unreadable library on either side adds nothing, so no user story is at risk', () => {
  assert.deepEqual(addedStoryHashes({ trusted: false, hashes: [] }, { trusted: true, hashes: ['a'] }), []);
  assert.deepEqual(addedStoryHashes({ trusted: true, hashes: [] }, { trusted: false, hashes: [] }), []);
});

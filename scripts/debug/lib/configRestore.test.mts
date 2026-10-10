import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockingDialogFor, emptySnapshotRefusal, mergeRestore, planLibraryRestore, shouldRecoverConfig, validateJourneyExtraction } from './configRestore.mts';

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

test('a snapshot whose settings delta was absent restores to absent, whatever the run stored', () => {
  const { next } = mergeRestore({ v2Stories: [{ id: 'mine' }] }, { settings: { judge: { enabled: false } }, v2Stories: [{ id: 'mine' }] });
  assert.equal(next && 'settings' in next, false);
});

test('a restore to "no config" stays a delete', () => {
  assert.equal(mergeRestore(null, { v2Stories: [{ id: 'x' }] }).next, null);
});

const story = (id: string, version: number, hash: string) => ({ id, version, hash, raw: { id, version, title: id } });

test('H1: a story that existed under the same id is put back exactly as it was, not deleted with the run\'s import', () => {
  const mine = story('v24-01-delete-decode', 1, 'v2-original');
  const before = { trusted: true, records: [story('other', 3, 'v2-other'), mine] };
  const afterRun = [story('other', 3, 'v2-other'), story('v24-01-delete-decode', 1, 'v2-de4f955d')];
  const plan = planLibraryRestore(before, afterRun);
  assert.deepEqual(plan.next, before.records);
  assert.deepEqual(plan.restored, ['v24-01-delete-decode (v2-original)']);
  assert.deepEqual(plan.removed, []);
  assert.equal(plan.changed, true);
  assert.notEqual(plan.next[1], mine, 'the plan writes copies, never the captured objects');
});

test('H1: a story the run created is removed, including an edited re-import the played hash no longer names (L5)', () => {
  const before = { trusted: true, records: [story('other', 3, 'v2-other')] };
  const afterRun = [story('other', 3, 'v2-other'), story('so-v25-fixture', 2, 'v2-edited')];
  const plan = planLibraryRestore(before, afterRun);
  assert.deepEqual(plan.next, before.records);
  assert.deepEqual(plan.removed, ['so-v25-fixture (v2-edited)']);
  assert.deepEqual(plan.restored, []);
});

test('control: a library the run did not touch is not rewritten', () => {
  const records = [story('a', 1, 'h-a'), story('b', 2, 'h-b')];
  const plan = planLibraryRestore({ trusted: true, records }, structuredClone(records));
  assert.deepEqual({ changed: plan.changed, removed: plan.removed, restored: plan.restored }, { changed: false, removed: [], restored: [] });
});

test('a pre-existing story the run deleted comes back, in its old place', () => {
  const records = [story('a', 1, 'h-a'), story('b', 2, 'h-b')];
  const plan = planLibraryRestore({ trusted: true, records }, [story('b', 2, 'h-b')]);
  assert.deepEqual(plan.next, records);
  assert.deepEqual(plan.restored, ['a (h-a)']);
});

test('an untrusted or missing capture removes nothing, and keeps what it cannot account for (S6)', () => {
  const current = [story('a', 1, 'h-a')];
  assert.deepEqual(planLibraryRestore({ trusted: false, records: [] }, current), { untrusted: true, next: current, removed: [], restored: [], changed: false });
  assert.equal(planLibraryRestore(null, current).untrusted, true);
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

test('A25: a refused import that still wrote a record is removed, because the restore is the pre-run library', () => {
  const before = { trusted: true, records: [story('user-story', 1, 'h-user')] };
  const plan = planLibraryRestore(before, [...before.records, story('refused-import', 1, 'h-refused')]);
  assert.deepEqual(plan.next, before.records);
  assert.deepEqual(plan.removed, ['refused-import (h-refused)']);
});

test('A25 control: an unreadable library before the run removes nothing, so no user story is at risk', () => {
  const current = [story('user-story', 1, 'h-user'), story('refused-import', 1, 'h-refused')];
  assert.deepEqual(planLibraryRestore({ trusted: false, records: [] }, current).next, current);
});

test('F15: a trusted capture of an all-defaults root restores to it, over whatever the run stored', () => {
  const live = ['settings', 'schema'];
  assert.equal(emptySnapshotRefusal({ trusted: true, present: true, value: {} }, live), null);
  assert.equal(emptySnapshotRefusal({ trusted: true, present: false, value: null }, live), null);
  assert.deepEqual(mergeRestore({}, { settings: { judge: { enabled: false } }, schema: 1 }).next, {});
});

test('F15: a capture that could not read the settings is refused over a populated root, and only there', () => {
  const live = ['settings'];
  assert.match(emptySnapshotRefusal({ trusted: false, present: false, value: null }, live) ?? '', /proves nothing/);
  assert.match(emptySnapshotRefusal({ present: true, value: {} }, live) ?? '', /proves nothing/);
  assert.equal(emptySnapshotRefusal({ trusted: false, present: false, value: null }, []), null);
  assert.equal(emptySnapshotRefusal({ trusted: false, present: true, value: { settings: {} } }, live), null);
});

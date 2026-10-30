import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { cleanResidue, laneUserDir, planResidue, removeResidueFolders, residueLeaks, type ResidueFs } from './p41Residue.mts';

const USER = resolve('/lanes/33/data/default-user');

const fakeFs = (paths: Record<string, 'dir' | 'file'>) => {
  const tree = new Map(Object.entries(paths).map(([path, kind]) => [resolve(USER, path), kind]));
  tree.set(USER, 'dir');
  const removed: string[] = [];
  const fs: ResidueFs = {
    exists: (path) => tree.has(resolve(path)),
    list: (path) => [...tree.entries()].filter(([entry]) => resolve(entry, '..') === resolve(path) && entry !== resolve(path))
      .map(([entry, kind]) => ({ name: entry.slice(resolve(path).length + 1), dir: kind === 'dir' })),
    rmdir: (path) => {
      const key = resolve(path);
      if ([...tree.keys()].some((entry) => entry !== key && resolve(entry, '..') === key)) throw new Error(`ENOTEMPTY ${key}`);
      tree.delete(key);
      removed.push(key);
    },
  };
  return { fs, tree, removed, unlink: (relative: string) => tree.delete(resolve(USER, relative)) };
};

const row = (groupId: string, title = 'SO-P41 Lighthouse', storyId = 'so-p41-lighthouse') => ({ storyId, title, groupId, updatedAt: '2026-10-28T00:00:00Z' });

test('plan: owned groups are the removed ones plus marker-story play rows; live and baseline groups are spared', () => {
  const plan = planResidue({ marker: 'SO-P41', storyId: 'so-p41-lighthouse', removedGroupIds: ['111'], liveGroupIds: ['333', '444'], baselineGroupIds: ['555'],
    plays: { c1: row('111'), c2: row('222'), c3: row('333'), c4: row('555'), c5: row('666', 'Owner story', 'owner-story'), c6: row('111', 'Other', 'other') } });
  assert.deepEqual(plan.plays, ['c1', 'c2', 'c6']);
  assert.deepEqual(plan.imageFolders.sort(), ['111', '222']);
  assert.deepEqual(plan.protectedGroups.sort(), ['333', '555']);
});

test('plan: an empty marker is refused and a path-like group id is never a folder', () => {
  assert.throws(() => planResidue({ marker: ' ', storyId: 'x', removedGroupIds: [], liveGroupIds: [], baselineGroupIds: [], plays: {} }), /non-empty marker/);
  const plan = planResidue({ marker: 'SO-P41', storyId: 'x', removedGroupIds: ['..', 'a/b', '777'], liveGroupIds: [], baselineGroupIds: [], plays: {} });
  assert.deepEqual(plan.imageFolders, ['777']);
});

test('laneUserDir: only a lane run (SO_LANE >= 1) names a data dir', () => {
  assert.equal(laneUserDir({ SO_LANE: '33' }, resolve('/lanes/33/debug')), resolve('/lanes/33/data/default-user'));
  assert.equal(laneUserDir({}, resolve('/lanes/0/debug')), null);
  assert.equal(laneUserDir({ SO_LANE: '0' }, resolve('/lanes/0/debug')), null);
});

test('folders: empty marked character folders go, a live card, a non-empty or an unmarked folder stays; owned image folders are emptied through the API then removed', async () => {
  const { fs, tree, unlink } = fakeFs({
    'characters': 'dir', 'characters/SO-P41 Ash': 'dir', 'characters/SO-P41 Bram': 'dir', 'characters/SO-P41 Bram/sub': 'dir',
    'characters/SO-P41 Cleo': 'dir', 'characters/SO-P41 Dora': 'dir', 'characters/SO-P41 Dora/joy.png': 'file', 'characters/Owner Card': 'dir',
    'characters/SO-P41 Ash.png': 'file',
    'user': 'dir', 'user/images': 'dir', 'user/images/111': 'dir', 'user/images/111/cast_a.png': 'file', 'user/images/111/director_b.png': 'file',
    'user/images/999': 'dir', 'user/images/999/owner.png': 'file',
  });
  const asked: string[] = [];
  const report = await removeResidueFolders({ userDir: USER, marker: 'SO-P41', liveCharacterNames: ['SO-P41 Cleo', 'Owner Card'], fs,
    plan: { plays: ['c1'], imageFolders: ['111', '222'], protectedGroups: [] },
    deleteImage: async (path) => { asked.push(path); return unlink(path); } });
  assert.deepEqual(report.characterFolders.removed.sort(), ['SO-P41 Ash', 'SO-P41 Bram']);
  assert.deepEqual(report.characterFolders.kept.map((entry) => entry.name).sort(), ['SO-P41 Cleo', 'SO-P41 Dora']);
  assert.match(report.characterFolders.kept.find((entry) => entry.name === 'SO-P41 Dora')!.reason, /not empty: joy\.png/);
  assert.deepEqual(asked.sort(), ['user/images/111/cast_a.png', 'user/images/111/director_b.png']);
  assert.deepEqual(report.imageFolders.removed, ['111']);
  assert.ok(tree.has(resolve(USER, 'characters/Owner Card')));
  assert.ok(tree.has(resolve(USER, 'characters/SO-P41 Ash.png')));
  assert.ok(tree.has(resolve(USER, 'user/images/999/owner.png')));
  assert.ok(!tree.has(resolve(USER, 'user/images/111')));
  assert.deepEqual(residueLeaks(report), ['character folder SO-P41 Cleo (card still listed)', 'character folder SO-P41 Dora (not empty: joy.png)']);
});

test('folders: a refused image delete leaves the folder and is reported as a leak', async () => {
  const { fs } = fakeFs({ 'user': 'dir', 'user/images': 'dir', 'user/images/111': 'dir', 'user/images/111/cast_a.png': 'file' });
  const report = await removeResidueFolders({ userDir: USER, marker: 'SO-P41', liveCharacterNames: [], fs,
    plan: { plays: [], imageFolders: ['111'], protectedGroups: [] }, deleteImage: async () => false });
  assert.deepEqual(report.imageFolders.removed, []);
  assert.deepEqual(residueLeaks(report), ['group image folder 111 (not empty: cast_a.png)', 'residue image user/images/111/cast_a.png: delete refused']);
});

test('folders: without a lane nothing on disk is touched and it is not a leak', async () => {
  const report = await removeResidueFolders({ userDir: null, marker: 'SO-P41', liveCharacterNames: [], plan: { plays: [], imageFolders: ['111'], protectedGroups: [] },
    deleteImage: async () => { throw new Error('must not be called'); } });
  assert.deepEqual(residueLeaks(report), []);
  assert.match(report.errors[0], /not a lane run/);
});

test('cleanResidue: reads groups and cards fresh from the server, drops only owned play rows, saves, and removes the folders', async () => {
  const root = globalThis as Record<string, any>;
  const plays: Record<string, unknown> = { c1: row('111'), c2: row('333'), c3: row('888', 'Owner story', 'owner-story') };
  const posts: Array<{ url: string; body: string }> = [];
  const { fs, unlink } = fakeFs({ 'characters': 'dir', 'characters/SO-P41 Ash': 'dir', 'user': 'dir', 'user/images': 'dir', 'user/images/111': 'dir', 'user/images/111/cast.png': 'file' });
  const savedFetch = root.fetch;
  root.SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({}), groups: [{ id: '111' }], extensionSettings: { 'story-orchestrator': { plays } } }) };
  root.fetch = async (url: string, init: { body: string }) => {
    posts.push({ url, body: init.body });
    if (url === '/api/groups/all') return { ok: true, json: async () => [{ id: 333 }] };
    if (url === '/api/characters/all') return { ok: true, json: async () => [{ name: 'Owner Card' }] };
    if (url === '/api/images/delete') return { ok: unlink(JSON.parse(init.body).path) };
    return { ok: false, status: 404 };
  };
  let saves = 0;
  try {
    const page = { evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };
    const report = await cleanResidue(page as never, { marker: 'SO-P41', storyId: 'so-p41-lighthouse', removedGroupIds: ['111'], baselineGroupIds: [],
      userDir: USER, fs, save: async () => { saves += 1; return { ok: true }; } });
    assert.deepEqual(report.plays, ['c1']);
    assert.deepEqual(Object.keys(plays).sort(), ['c2', 'c3']);
    assert.equal(saves, 1);
    assert.deepEqual(report.protectedGroups, ['333']);
    assert.deepEqual(report.characterFolders.removed, ['SO-P41 Ash']);
    assert.deepEqual(report.imageFolders.removed, ['111']);
    assert.deepEqual(posts.filter((post) => post.url === '/api/images/delete').map((post) => JSON.parse(post.body).path), ['user/images/111/cast.png']);
    assert.deepEqual(residueLeaks(report), []);
  } finally {
    root.fetch = savedFetch;
    delete root.SillyTavern;
  }
});

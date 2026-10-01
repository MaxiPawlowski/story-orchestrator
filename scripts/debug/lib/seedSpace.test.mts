import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { findReclaimable, GIB, lastSeededLaneBytes, removeStaleSpriteWorktrees, seedSpaceNeed, seedSpaceRefusal, staleSpriteWorktrees, type SpaceFs } from './seedSpace.mts';

const ROOT = join('X:', 'lanes');
const CURRENT = '6ebe71a0123456789abcdef0123456789abcdef0';
const OLD = '38f62c680123456789abcdef0123456789abcdef';
const OLDER = '1ab7323e0123456789abcdef0123456789abcdef';

const fakeFs = (tree: Record<string, string[]>, sizes: Record<string, number>, json: Record<string, unknown> = {}): SpaceFs => ({
  list: async (dir) => { if (!(dir in tree)) throw new Error(`ENOENT ${dir}`); return tree[dir]; },
  bytes: async (dir) => sizes[dir] ?? 0,
  readJson: async (file) => { if (!(file in json)) throw new Error(`ENOENT ${file}`); return json[file]; },
});

const work = (lane: string) => join(ROOT, lane, 'adolion-fresh');

test('seed space: the need is 5 GB or 2.5 x the last seeded lane, whichever is larger', () => {
  assert.equal(seedSpaceNeed(null), 5 * GIB);
  assert.equal(seedSpaceNeed(1 * GIB), 5 * GIB);
  assert.equal(seedSpaceNeed(2.4 * GIB), Math.ceil(6 * GIB));
});

test('seed space: refuses at 2.6 GB free (the ENOSPC seed), names the biggest reclaimable dirs, and passes with room', () => {
  const reclaimable = [
    { path: join(work('2'), `sprites-${OLD.slice(0, 12)}`), bytes: 2.6 * GIB, kind: 'old-pin sprite worktree' as const },
    { path: join(ROOT, 'archive', '1-T1-1-x'), bytes: 1.9 * GIB, kind: 'archived lane' as const },
  ];
  const refusal = seedSpaceRefusal({ root: ROOT, freeBytes: 2.6 * GIB, lastLaneBytes: 2 * GIB, reclaimable });
  assert.ok(refusal?.startsWith(`refusing to seed: ${ROOT} has 2.6 GB free, a seed needs 5.0 GB`), refusal ?? '');
  assert.ok(refusal?.includes(`sprites-${OLD.slice(0, 12)} (old-pin sprite worktree, 2.6 GB)`));
  assert.ok(refusal?.includes('1-T1-1-x (archived lane, 1.9 GB)'));
  assert.ok(refusal?.includes('worktree remove'));
  assert.equal(seedSpaceRefusal({ root: ROOT, freeBytes: 5.1 * GIB, lastLaneBytes: 2 * GIB, reclaimable }), null);
  assert.ok(seedSpaceRefusal({ root: ROOT, freeBytes: 5.1 * GIB, lastLaneBytes: 2.4 * GIB, reclaimable: [] })?.includes('Nothing reclaimable'));
});

test('seed space: old-pin sprite worktrees in OTHER lanes and archived lanes are reclaimable, biggest first; the current pin and this lane are not', async () => {
  const fs = fakeFs({
    [ROOT]: ['1', '2', '3', 'archive', '1-seed.log'],
    [work('1')]: [`sprites-${OLD.slice(0, 12)}`, `campaign-${OLD.slice(0, 12)}`, 'report-1.json'],
    [work('2')]: [`sprites-${CURRENT.slice(0, 12)}`, `sprites-${OLDER.slice(0, 12)}`, `sprites-${OLD.slice(0, 12)}`],
    [work('3')]: [`sprites-${OLD.slice(0, 12)}`],
    [join(ROOT, 'archive')]: ['2-T1-2-a', '3-T1-3-b'],
  }, {
    [join(work('1'), `sprites-${OLD.slice(0, 12)}`)]: 2 * GIB,
    [join(work('2'), `sprites-${OLDER.slice(0, 12)}`)]: 1 * GIB,
    [join(work('2'), `sprites-${OLD.slice(0, 12)}`)]: 3 * GIB,
    [join(ROOT, 'archive', '3-T1-3-b')]: 0.5 * GIB,
  }, { [join(ROOT, 'archive', '2-T1-2-a', 'archive.json')]: { bytes: 2.5 * GIB } });
  const found = await findReclaimable(ROOT, 3, CURRENT, fs);
  assert.deepEqual(found.map((entry) => [entry.path, entry.kind, entry.bytes / GIB]), [
    [join(work('2'), `sprites-${OLD.slice(0, 12)}`), 'old-pin sprite worktree', 3],
    [join(ROOT, 'archive', '2-T1-2-a'), 'archived lane', 2.5],
    [join(work('1'), `sprites-${OLD.slice(0, 12)}`), 'old-pin sprite worktree', 2],
    [join(work('2'), `sprites-${OLDER.slice(0, 12)}`), 'old-pin sprite worktree', 1],
    [join(ROOT, 'archive', '3-T1-3-b'), 'archived lane', 0.5],
  ]);
});

test('seed space: the last seeded lane size is the newest report that recorded one, across lanes', async () => {
  const fs = fakeFs({
    [ROOT]: ['1', '2'],
    [work('1')]: ['report-2026-10-01T08-00-00-000Z.json', 'report-2026-10-01T14-00-00-000Z.json'],
    [work('2')]: ['report-2026-10-01T12-00-00-000Z.json', 'inventory-latest.json'],
  }, {}, {
    [join(work('1'), 'report-2026-10-01T08-00-00-000Z.json')]: { laneBytes: 1 * GIB },
    [join(work('1'), 'report-2026-10-01T14-00-00-000Z.json')]: { problems: [] },
    [join(work('2'), 'report-2026-10-01T12-00-00-000Z.json')]: { laneBytes: 2 * GIB },
  });
  assert.equal(await lastSeededLaneBytes(ROOT, fs), 2 * GIB);
  assert.equal(await lastSeededLaneBytes(ROOT, fakeFs({ [ROOT]: [] }, {})), null);
});

test('seed space: stale sprite worktrees in this lane are removed through git worktree remove, never deleted directly; a failed remove is reported, not forced', async () => {
  assert.deepEqual(staleSpriteWorktrees([`sprites-${CURRENT.slice(0, 12)}`, `sprites-${OLD.slice(0, 12)}`, 'sprites-notahash', `campaign-${OLD.slice(0, 12)}`], CURRENT), [`sprites-${OLD.slice(0, 12)}`]);
  const calls: string[][] = [];
  const fs = { list: async () => [`sprites-${CURRENT.slice(0, 12)}`, `sprites-${OLD.slice(0, 12)}`, `sprites-${OLDER.slice(0, 12)}`] };
  const git = async (args: string[]) => {
    calls.push(args);
    return args.includes(join(work('3'), `sprites-${OLDER.slice(0, 12)}`)) ? { code: 128, output: 'fatal: is not a working tree' } : { code: 0, output: '' };
  };
  const result = await removeStaleSpriteWorktrees('C:/campaign', work('3'), CURRENT, fs, git);
  assert.deepEqual(result.removed, [join(work('3'), `sprites-${OLD.slice(0, 12)}`)]);
  assert.deepEqual(result.failed, [{ path: join(work('3'), `sprites-${OLDER.slice(0, 12)}`), reason: 'fatal: is not a working tree' }]);
  assert.deepEqual(calls, [
    ['-C', 'C:/campaign', 'worktree', 'remove', '--force', join(work('3'), `sprites-${OLDER.slice(0, 12)}`)],
    ['-C', 'C:/campaign', 'worktree', 'remove', '--force', join(work('3'), `sprites-${OLD.slice(0, 12)}`)],
    ['-C', 'C:/campaign', 'worktree', 'prune'],
  ]);
  const none: string[][] = [];
  await removeStaleSpriteWorktrees('C:/campaign', work('3'), CURRENT, { list: async () => [`sprites-${CURRENT.slice(0, 12)}`] }, async (args) => { none.push(args); return { code: 0, output: '' }; });
  assert.deepEqual(none, []);
});

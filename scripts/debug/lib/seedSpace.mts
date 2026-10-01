import { join } from 'node:path';

export const GIB = 1024 ** 3;
export const SEED_MIN_FREE_BYTES = 5 * GIB;
export const SEED_LANE_FACTOR = 2.5;
export const ARCHIVE_DIR = 'archive';

const SPRITE_WORKTREE = /^sprites-([0-9a-f]{12})$/;
const LANE_DIR = /^\d+$/;
const REPORT = /^report-.+\.json$/;

export type ReclaimableKind = 'old-pin sprite worktree' | 'archived lane';

export interface Reclaimable { path: string; bytes: number; kind: ReclaimableKind }

export interface SpaceFs {
  list: (dir: string) => Promise<string[]>;
  bytes: (dir: string) => Promise<number>;
  readJson: (file: string) => Promise<any>;
}

export interface SpaceGit { git: (args: string[]) => Promise<{ code: number; output: string }> }

export const gib = (bytes: number) => `${(bytes / GIB).toFixed(1)} GB`;

export const seedSpaceNeed = (lastLaneBytes: number | null) => Math.max(SEED_MIN_FREE_BYTES, Math.ceil(SEED_LANE_FACTOR * Math.max(0, lastLaneBytes ?? 0)));

export const staleSpriteWorktrees = (names: string[], commit: string) =>
  names.filter((name) => SPRITE_WORKTREE.test(name) && SPRITE_WORKTREE.exec(name)?.[1] !== commit.slice(0, 12)).sort();

const listOrEmpty = async (fs: SpaceFs, dir: string) => fs.list(dir).catch(() => [] as string[]);

export async function findReclaimable(lanesRoot: string, lane: number, commit: string, fs: SpaceFs): Promise<Reclaimable[]> {
  const others = (await listOrEmpty(fs, lanesRoot)).filter((name) => LANE_DIR.test(name) && Number(name) !== lane);
  const sprites = await Promise.all(others.map(async (name) => {
    const work = join(lanesRoot, name, 'adolion-fresh');
    return Promise.all(staleSpriteWorktrees(await listOrEmpty(fs, work), commit).map(async (dir) => ({ path: join(work, dir), bytes: await fs.bytes(join(work, dir)), kind: 'old-pin sprite worktree' as const })));
  }));
  const archiveRoot = join(lanesRoot, ARCHIVE_DIR);
  const archives = await Promise.all((await listOrEmpty(fs, archiveRoot)).map(async (name) => {
    const path = join(archiveRoot, name);
    const recorded = await fs.readJson(join(path, 'archive.json')).then((record) => record?.bytes).catch(() => null);
    return { path, bytes: typeof recorded === 'number' && recorded >= 0 ? recorded : await fs.bytes(path), kind: 'archived lane' as const };
  }));
  return [...sprites.flat(), ...archives].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
}

export async function lastSeededLaneBytes(lanesRoot: string, fs: SpaceFs): Promise<number | null> {
  const lanes = (await listOrEmpty(fs, lanesRoot)).filter((name) => LANE_DIR.test(name));
  const reports = (await Promise.all(lanes.map(async (name) => {
    const work = join(lanesRoot, name, 'adolion-fresh');
    return Promise.all((await listOrEmpty(fs, work)).filter((file) => REPORT.test(file)).map(async (file) => ({ file, report: await fs.readJson(join(work, file)).catch(() => null) })));
  }))).flat();
  const recorded = reports.filter((entry) => typeof entry.report?.laneBytes === 'number').sort((a, b) => b.file.localeCompare(a.file));
  return recorded.length ? recorded[0].report.laneBytes : null;
}

export function seedSpaceRefusal({ root, freeBytes, lastLaneBytes, reclaimable }: { root: string; freeBytes: number; lastLaneBytes: number | null; reclaimable: Reclaimable[] }): string | null {
  const need = seedSpaceNeed(lastLaneBytes);
  if (freeBytes >= need) return null;
  const basis = lastLaneBytes === null ? 'the 5 GB floor (no seeded lane size recorded yet)' : `max(5 GB, ${SEED_LANE_FACTOR} x the last seeded lane, ${gib(lastLaneBytes)})`;
  const listed = reclaimable.slice(0, 6).map((entry) => `${entry.path} (${entry.kind}, ${gib(entry.bytes)})`);
  const total = reclaimable.reduce((sum, entry) => sum + entry.bytes, 0);
  const advice = listed.length
    ? `Reclaimable (${gib(total)} in ${reclaimable.length}): ${listed.join('; ')}. Remove an old sprite worktree with \`git -C <campaign repo> worktree remove --force <dir>\`, never by deleting the folder`
    : 'Nothing reclaimable known under the lanes root (no old-pin sprite worktree in another lane, no archived lane)';
  return `refusing to seed: ${root} has ${gib(freeBytes)} free, a seed needs ${gib(need)} (${basis}). ${advice}.`;
}

export async function removeStaleSpriteWorktrees(repo: string, work: string, commit: string, fs: Pick<SpaceFs, 'list'>, git: SpaceGit['git']) {
  const stale = staleSpriteWorktrees(await fs.list(work).catch(() => [] as string[]), commit);
  const removed: string[] = [];
  const failed: Array<{ path: string; reason: string }> = [];
  for (const name of stale) {
    const path = join(work, name);
    const result = await git(['-C', repo, 'worktree', 'remove', '--force', path]);
    if (result.code === 0) removed.push(path);
    else failed.push({ path, reason: result.output.trim().slice(-300) || `exit ${result.code}` });
  }
  if (stale.length) await git(['-C', repo, 'worktree', 'prune']);
  return { removed, failed };
}

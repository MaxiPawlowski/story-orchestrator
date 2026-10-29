import { existsSync, readdirSync, rmdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { evaluateInST } from './evaluate.mts';

export type PlayRowLike = { storyId?: unknown; title?: unknown; groupId?: unknown };

export interface ResidueInput {
  marker: string;
  storyId: string;
  removedGroupIds: string[];
  liveGroupIds: string[];
  baselineGroupIds: string[];
  plays: Record<string, PlayRowLike>;
}

export interface ResiduePlan { plays: string[]; imageFolders: string[]; protectedGroups: string[] }

export interface ResidueFs {
  exists(path: string): boolean;
  list(path: string): Array<{ name: string; dir: boolean }>;
  rmdir(path: string): void;
}

export interface FolderReport { removed: string[]; kept: Array<{ name: string; reason: string }> }

export interface ResidueReport {
  userDir: string | null;
  plays: string[];
  protectedGroups: string[];
  characterFolders: FolderReport;
  imageFolders: FolderReport & { files: string[] };
  errors: string[];
}

const SAFE_SEGMENT = (name: string) => name.length > 0 && !/[\\/]/.test(name) && name !== '.' && name !== '..';

const needleOf = (marker: string) => {
  const needle = marker.trim().toLowerCase();
  if (!needle) throw new Error('a non-empty marker is required: an empty prefix matches every asset');
  return needle;
};

export function planResidue(input: ResidueInput): ResiduePlan {
  const needle = needleOf(input.marker);
  const markerRow = (row: PlayRowLike) => String(row?.title ?? '').trim().toLowerCase().startsWith(needle) || row?.storyId === input.storyId;
  const owned = new Set(input.removedGroupIds.map(String));
  for (const row of Object.values(input.plays)) if (markerRow(row) && typeof row?.groupId === 'string') owned.add(row.groupId);
  const live = new Set(input.liveGroupIds.map(String));
  const before = new Set(input.baselineGroupIds.map(String));
  const groups = new Set([...owned].filter((id) => !live.has(id) && !before.has(id) && SAFE_SEGMENT(id)));
  return {
    plays: Object.entries(input.plays).filter(([, row]) => groups.has(String(row?.groupId))).map(([chatId]) => chatId),
    imageFolders: [...groups],
    protectedGroups: [...owned].filter((id) => live.has(id) || before.has(id)),
  };
}

export function laneUserDir(env: NodeJS.ProcessEnv, debugDir: string): string | null {
  const lane = Number(env.SO_LANE);
  return Number.isInteger(lane) && lane >= 1 ? resolve(dirname(debugDir), 'data', 'default-user') : null;
}

export const nodeResidueFs: ResidueFs = {
  exists: (path) => existsSync(path),
  list: (path) => readdirSync(path, { withFileTypes: true }).map((entry) => ({ name: entry.name, dir: entry.isDirectory() })),
  rmdir: (path) => rmdirSync(path),
};

const filesUnder = (fs: ResidueFs, path: string, prefix = ''): string[] => fs.list(path)
  .flatMap((entry) => (entry.dir ? filesUnder(fs, resolve(path, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]));

const removeEmptyTree = (fs: ResidueFs, path: string) => {
  for (const entry of fs.list(path)) if (entry.dir) removeEmptyTree(fs, resolve(path, entry.name));
  fs.rmdir(path);
};

export interface ResidueRemoval {
  userDir: string | null;
  marker: string;
  liveCharacterNames: string[];
  plan: ResiduePlan;
  deleteImage: (relativePath: string) => Promise<boolean>;
  fs?: ResidueFs;
}

export async function removeResidueFolders(input: ResidueRemoval): Promise<ResidueReport> {
  const fs = input.fs ?? nodeResidueFs;
  const report: ResidueReport = { userDir: input.userDir, plays: input.plan.plays, protectedGroups: input.plan.protectedGroups,
    characterFolders: { removed: [], kept: [] }, imageFolders: { removed: [], kept: [], files: [] }, errors: [] };
  if (!input.userDir) {
    report.errors.push('not a lane run (SO_LANE unset): residue folders not checked');
    return report;
  }
  if (!fs.exists(input.userDir)) {
    report.errors.push(`lane user dir missing: ${input.userDir}`);
    return report;
  }
  const needle = needleOf(input.marker);
  const live = new Set(input.liveCharacterNames.map((name) => name.trim().toLowerCase()));
  const characters = resolve(input.userDir, 'characters');
  for (const entry of fs.exists(characters) ? fs.list(characters) : []) {
    const key = entry.name.trim().toLowerCase();
    if (!entry.dir || !key.startsWith(needle) || !SAFE_SEGMENT(entry.name)) continue;
    if (live.has(key)) { report.characterFolders.kept.push({ name: entry.name, reason: 'card still listed' }); continue; }
    const path = resolve(characters, entry.name);
    const left = filesUnder(fs, path);
    if (left.length) { report.characterFolders.kept.push({ name: entry.name, reason: `not empty: ${left.slice(0, 5).join(', ')}` }); continue; }
    try { removeEmptyTree(fs, path); report.characterFolders.removed.push(entry.name); }
    catch (error) { report.characterFolders.kept.push({ name: entry.name, reason: String(error) }); }
  }
  const images = resolve(input.userDir, 'user', 'images');
  for (const id of input.plan.imageFolders) {
    const path = resolve(images, id);
    if (!SAFE_SEGMENT(id) || !fs.exists(path)) continue;
    for (const file of filesUnder(fs, path)) {
      const relative = `user/images/${id}/${file}`;
      if (await input.deleteImage(relative)) report.imageFolders.files.push(relative);
      else report.errors.push(`image ${relative}: delete refused`);
    }
    const left = filesUnder(fs, path);
    if (left.length) { report.imageFolders.kept.push({ name: id, reason: `not empty: ${left.slice(0, 5).join(', ')}` }); continue; }
    try { removeEmptyTree(fs, path); report.imageFolders.removed.push(id); }
    catch (error) { report.imageFolders.kept.push({ name: id, reason: String(error) }); }
  }
  return report;
}

export const residueLeaks = (report: ResidueReport): string[] => [
  ...report.characterFolders.kept.map((row) => `character folder ${row.name} (${row.reason})`),
  ...report.imageFolders.kept.map((row) => `group image folder ${row.name} (${row.reason})`),
  ...report.errors.filter((error) => !error.startsWith('not a lane run')).map((error) => `residue ${error}`),
];

type PageLike = Parameters<typeof evaluateInST>[0];

export interface CleanResidueInput {
  marker: string;
  storyId: string;
  removedGroupIds: string[];
  baselineGroupIds: string[];
  userDir: string | null;
  save: (page: PageLike) => Promise<unknown>;
  fs?: ResidueFs;
}

export async function cleanResidue(page: PageLike, input: CleanResidueInput): Promise<ResidueReport & { saved?: unknown }> {
  const live = await evaluateInST(page, async () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const headers = ctx.getRequestHeaders();
    const list = async (url: string) => {
      const response = await fetch(url, { method: 'POST', headers, body: '{}' });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      const rows = await response.json();
      return Array.isArray(rows) ? rows : [];
    };
    const groups = (await list('/api/groups/all')).map((row: any) => String(row?.id));
    const characters = (await list('/api/characters/all')).map((row: any) => row?.name).filter((name: unknown) => typeof name === 'string');
    return { groups, characters, plays: JSON.parse(JSON.stringify(ctx.extensionSettings?.['story-orchestrator']?.plays ?? {})) };
  });
  const plan = planResidue({ marker: input.marker, storyId: input.storyId, removedGroupIds: input.removedGroupIds, liveGroupIds: live.groups,
    baselineGroupIds: input.baselineGroupIds, plays: live.plays });
  const dropped: string[] = plan.plays.length ? await evaluateInST(page, (ids: string[]) => {
    const plays = (globalThis as any).SillyTavern.getContext().extensionSettings?.['story-orchestrator']?.plays;
    if (!plays || typeof plays !== 'object') return [];
    const gone = ids.filter((id) => Object.prototype.hasOwnProperty.call(plays, id));
    for (const id of gone) delete plays[id];
    return gone;
  }, plan.plays) : [];
  const saved = dropped.length ? await input.save(page) : undefined;
  const report = await removeResidueFolders({ userDir: input.userDir, marker: input.marker, liveCharacterNames: live.characters, plan, ...(input.fs ? { fs: input.fs } : {}),
    deleteImage: (path) => evaluateInST(page, async (path: string) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const response = await fetch('/api/images/delete', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ path }) });
      return response.ok;
    }, path) });
  return { ...report, plays: dropped, ...(saved !== undefined ? { saved } : {}) };
}

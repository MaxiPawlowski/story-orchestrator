export interface CopyArgs {
  help: boolean;
  lane: number;
  set: string;
  members: string[];
  confirm: boolean;
  errors: string[];
}

export interface SourceFile { rel: string; size: number; hash: string }
export type CopyAction = { rel: string; size: number; action: 'copy' | 'same' | 'conflict' };

const SET_ID = /^[a-z0-9_]+$/;

export function parseCopyArgs(argv: string[]): CopyArgs {
  const value = (flag: string, fallback = '') => { const at = argv.indexOf(flag); return at < 0 ? fallback : argv[at + 1] ?? fallback; };
  const errors: string[] = [];
  const lane = Number(value('--lane'));
  const set = value('--set', 'so_presentation_v1');
  if (!Number.isInteger(lane) || lane < 1) errors.push('--lane <n> is required, n >= 1 (the lane that prepared the sprites; never lane 0).');
  if (!SET_ID.test(set)) errors.push(`--set must be lower-case letters, digits and _ (got "${set}").`);
  const members = value('--members').split(',').map((entry) => entry.trim()).filter(Boolean);
  return { help: argv.includes('--help'), lane, set, members, confirm: argv.includes('--confirm'), errors };
}

export const matchesSet = (name: string, set: string): boolean => {
  const bare = name.startsWith('anim-') ? name.slice(5) : name;
  return bare === set || new RegExp(`^${set}[a-d]$`).test(bare);
};

export const wantedFolder = (folder: string, members: string[]): boolean => !members.length || members.some((name) => name.toLowerCase() === folder.toLowerCase());

export function rigAssetRel(url: string): string | null {
  let path: string;
  try { path = decodeURIComponent(url.split('?')[0]); } catch { return null; }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('\\') || path.includes(':')) return null;
  return /^\/(characters|user\/files)\//.test(path) ? path.slice(1) : null;
}

export interface RigRef { member: string; look: string; artHash: string; source: string; manifest: string }

export function rigRefsFor(refs: Record<string, RigRef>, set: string, folders: string[]): Record<string, RigRef> {
  return Object.fromEntries(Object.entries(refs).filter(([, ref]) => matchesSet(ref.look, set)
    && folders.some((folder) => rigAssetRel(ref.source)?.startsWith(`characters/${folder}/`))));
}

export function planCopy(source: SourceFile[], destination: ReadonlyMap<string, string | null>): CopyAction[] {
  return source.map((file) => {
    const existing = destination.get(file.rel) ?? null;
    return { rel: file.rel, size: file.size, action: existing === null ? 'copy' : existing === file.hash ? 'same' : 'conflict' };
  });
}

export const summarize = (plan: CopyAction[]) => ({
  copy: plan.filter((entry) => entry.action === 'copy').length,
  same: plan.filter((entry) => entry.action === 'same').length,
  conflict: plan.filter((entry) => entry.action === 'conflict').length,
  bytes: plan.filter((entry) => entry.action === 'copy').reduce((sum, entry) => sum + entry.size, 0),
});

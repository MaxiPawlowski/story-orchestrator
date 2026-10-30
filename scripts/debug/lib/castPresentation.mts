export const CAST_STEPS = ['base', 'prepare', 'front', 'expressions', 'frames', 'rig'] as const;

export interface CastArgs {
  help: boolean;
  group: string;
  members: string[];
  set: string;
  only: Set<string> | null;
  front: boolean;
  allow: string[];
  errors: string[];
}

export interface CastMember { id: string; name: string }

const SET_ID = /^[a-z0-9_]+$/;

export function parseCastArgs(argv: string[]): CastArgs {
  const value = (flag: string, fallback = '') => { const at = argv.indexOf(flag); return at < 0 ? fallback : argv[at + 1] ?? fallback; };
  const list = (flag: string) => value(flag).split(',').map((entry) => entry.trim()).filter(Boolean);
  const errors: string[] = [];
  const group = value('--group');
  const set = value('--set', 'so_presentation_v1');
  const only = list('--only');
  if (argv.includes('--cast')) errors.push('--cast is gone: the cast is read from the group itself; filter it with --members "Name A,Name B".');
  if (!group) errors.push('--group <name|id> is required.');
  if (!SET_ID.test(set)) errors.push(`--set must be lower-case letters, digits and _ (got "${set}").`);
  const unknown = only.filter((step) => !(CAST_STEPS as readonly string[]).includes(step));
  if (unknown.length) errors.push(`--only names unknown steps: ${unknown.join(', ')} (known: ${CAST_STEPS.join(', ')}).`);
  return { help: argv.includes('--help'), group, members: list('--members'), set, only: only.length ? new Set(only) : null, front: argv.includes('--front'), allow: list('--allow'), errors };
}

export function pickMembers(groupNames: string[], filter: string[]): { cast: CastMember[]; missing: string[] } {
  const wanted = new Set(filter.map((name) => name.toLowerCase()));
  const all = groupNames.map((name, index) => ({ id: `m${index + 1}`, name }));
  const cast = wanted.size ? all.filter((member) => wanted.has(member.name.toLowerCase())) : all;
  const missing = filter.filter((name) => !groupNames.some((known) => known.toLowerCase() === name.toLowerCase()));
  return { cast, missing };
}

export interface CleanupReport {
  removed: unknown;
  chats: { deleted?: string[]; notDeleted?: string[]; skipped?: unknown[] } | { error: string } | null;
  reapPrompts: { leaked?: string[] } | { error: string } | null;
  spriteSettings: { restored: boolean; error?: string };
  differences: Array<{ path: string; allowed?: boolean }> | { error: string } | null;
}

export function cleanupProblems(report: CleanupReport, sandboxChat: string | null): string[] {
  const problems: string[] = [];
  const failed = (value: unknown): value is { error: string } => typeof value === 'object' && value !== null && 'error' in value;
  if (failed(report.removed)) problems.push(`workshop story not removed: ${report.removed.error}`);
  if (!report.chats || failed(report.chats)) problems.push(`sandbox chat cleanup failed: ${failed(report.chats) ? report.chats.error : 'not run'}`);
  else {
    if (report.chats.notDeleted?.length) problems.push(`sandbox chats left: ${report.chats.notDeleted.join(', ')}`);
    if (sandboxChat && !report.chats.deleted?.includes(sandboxChat)) problems.push(`sandbox chat ${sandboxChat} was not deleted`);
  }
  if (!report.reapPrompts || failed(report.reapPrompts)) problems.push('reap prompts not settled');
  else if (report.reapPrompts.leaked?.length) problems.push(`reap prompts left open: ${report.reapPrompts.leaked.join(', ')}`);
  if (!report.spriteSettings.restored) problems.push(`sprite settings not restored${report.spriteSettings.error ? `: ${report.spriteSettings.error}` : ''}`);
  if (!report.differences || failed(report.differences)) problems.push('run header not diffed');
  else for (const difference of report.differences.filter((entry) => !entry.allowed)) problems.push(`run header changed: ${difference.path}`);
  return problems;
}

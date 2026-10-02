import { tailProblems, type TailAcks, type TailName } from './sessionTails.mts';

export const HEADER_DIFF_ALLOW = 'chatId,groupId,authorView,story,group,inventory.journal';

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export function headerDiffArgs(baseline: string, out: string, chats: Array<{ chatId?: unknown; groupId?: unknown }>, cardAllow: string[] = []): string[] {
  const owned = [...new Set(chats.map((chat) => chat.chatId).filter(nonEmpty))];
  const ownedGroupChats = [...new Set(chats.filter((chat) => nonEmpty(chat.chatId) && !chat.chatId.includes(',') && nonEmpty(chat.groupId)).map((chat) => `inventory.groupChats:+${chat.groupId}/${chat.chatId}`))];
  const allow = [HEADER_DIFF_ALLOW, ...ownedGroupChats, ...cardAllow.filter(nonEmpty)].join(',');
  return ['scripts/debug/so-run-header.mts', 'diff', baseline, '--allow', allow, ...(owned.length ? ['--owned', owned.join(',')] : []), '--served-identity', '--allow-warnings', '--out', out];
}

const SERVED_LINE = /^ok\s+(\S+)\s.*\(allowed by served-bundle ([0-9a-f]+)\)\s*$/;

export function servedIdentityWarnings(output: string): string[] {
  const allowed = output.split(/\r?\n/).map((line) => SERVED_LINE.exec(line)).filter((match): match is RegExpExecArray => match !== null);
  if (!allowed.length) return [];
  const served = allowed[0][2];
  return [`the repo build moved during the session (${allowed.map((match) => match[1]).join(', ')}) while the served bundle ${served} stayed identical: allowed, the code under test did not change`];
}

export interface StopDeps {
  endPhase: () => Promise<{ ok: boolean; problems: string[] }>;
  headerDiff: () => Promise<{ code: number; output: string }>;
  requestDrain: () => Promise<void>;
  waitDrained: () => Promise<Partial<Record<TailName, TailAcks>>>;
  killTails: () => Promise<void>;
  verify: () => Promise<string[]>;
}

export interface StopOutcome {
  steps: string[];
  problems: string[];
  invalid: string[];
  runHeaderDiff: { exit: number; ok: boolean };
  warnings: string[];
  acks: Partial<Record<TailName, TailAcks>>;
  valid: boolean;
}

export async function stopSequence(deps: StopDeps): Promise<StopOutcome> {
  const steps: string[] = [];
  const problems: string[] = [];
  const invalid: string[] = [];
  steps.push('end');
  const end = await deps.endPhase();
  problems.push(...end.problems);
  if (!end.ok) invalid.push('the end phase did not export the session state');
  steps.push('header-diff');
  const diff = await deps.headerDiff();
  if (diff.code !== 0) invalid.push(`the run header diff failed (exit ${diff.code}): the install changed in a way the session did not declare`);
  const warnings = servedIdentityWarnings(diff.output);
  steps.push('drain');
  await deps.requestDrain();
  const acks = await deps.waitDrained();
  invalid.push(...tailProblems(acks, 'stop'));
  steps.push('kill');
  await deps.killTails();
  steps.push('verify');
  invalid.push(...await deps.verify());
  return { steps, problems, invalid, runHeaderDiff: { exit: diff.code, ok: diff.code === 0 }, warnings, acks, valid: invalid.length === 0 };
}

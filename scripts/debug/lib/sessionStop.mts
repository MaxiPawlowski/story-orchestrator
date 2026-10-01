import { tailProblems, type TailAcks, type TailName } from './sessionTails.mts';

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
  steps.push('drain');
  await deps.requestDrain();
  const acks = await deps.waitDrained();
  invalid.push(...tailProblems(acks, 'stop'));
  steps.push('kill');
  await deps.killTails();
  steps.push('verify');
  invalid.push(...await deps.verify());
  return { steps, problems, invalid, runHeaderDiff: { exit: diff.code, ok: diff.code === 0 }, acks, valid: invalid.length === 0 };
}

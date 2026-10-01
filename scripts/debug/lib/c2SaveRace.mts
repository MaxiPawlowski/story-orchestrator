export const C2_MARKER = 'SO-C2';

export const C2_STORY = {
  format: 2,
  id: 'so-c2-save-race',
  version: 1,
  title: 'SO-C2 save race guard',
  description: 'v2.6 plan 01 C2: the vehicle for the late-bound save guard. Model-free: no checkpoint fires on its own.',
  qualities: [{ key: 'harness_gate', type: 'bool', source: 'code', latching: true, rubric: 'Set only by the test harness.' }],
  checkpoints: [
    { id: 'start', name: 'Start', objective: 'Wait.', type: 'anchor', start: true },
    { id: 'end', name: 'End', objective: 'Never reached by C2.', type: 'anchor' },
  ],
  transitions: [{ from: 'start', to: 'end', priority: 1, gate: { q: 'harness_gate', op: '==', v: true } }],
};

export type C2Arm = 'guard' | 'control';

export interface C2Guard {
  groupId: string;
  sandboxChatId: string;
  owned: string[];
  preexisting: string[];
  soloChats?: Array<{ chatId: string; avatar: string; name: string }>;
}

export interface C2Live {
  groupId: string | null;
  chatId: string | null;
  storyId: string | null;
}

export function attemptRefusal(guard: C2Guard | null, live: C2Live, solo: { chatId: string } | null, storyId: string = C2_STORY.id): string | null {
  if (!guard) return 'no sandbox: C2 runs only in a chat it created';
  if (!guard.groupId || !guard.sandboxChatId) return 'the sandbox names no group or chat';
  if (guard.preexisting.includes(guard.sandboxChatId)) return `${guard.sandboxChatId} existed before the run: C2 never runs in a chat it did not create`;
  if (!guard.owned.includes(guard.sandboxChatId)) return `${guard.sandboxChatId} is not owned by this run`;
  if (live.groupId !== guard.groupId || live.chatId !== guard.sandboxChatId) return `the page is on ${live.chatId ?? 'no chat'} in ${live.groupId ?? 'no group'}, not the run's sandbox ${guard.sandboxChatId} in ${guard.groupId}`;
  if (live.storyId !== storyId) return `the sandbox plays ${live.storyId ?? 'no story'}, not ${storyId}`;
  if (!solo) return 'no solo chat: the populated-solo case needs one the run created';
  if (!(guard.soloChats ?? []).some((entry) => entry.chatId === solo.chatId) || !guard.owned.includes(solo.chatId)) return `the solo chat ${solo.chatId} was not created by this run`;
  return null;
}

export interface DiskChat {
  messages: number | null;
  digest: string | null;
}

export interface C2Refusal {
  seq: number;
  file: string;
  rows: number;
  askedFor: string | null;
  open: string | null;
  reason: string;
}

export interface C2AttemptResult {
  arm: C2Arm;
  aborted?: string;
  dialog?: string | null;
  ringAvailable?: boolean;
  wroteSetting?: boolean;
  soloBefore?: DiskChat;
  soloAfter?: DiskChat;
  openedAfterGo?: string | null;
  backInSandbox?: boolean;
  refusals?: C2Refusal[];
  healthAfterSwitch?: { lastOutcome?: string | null } | null;
  healthAfterNext?: { lastOutcome?: string | null } | null;
}

export type C2Outcome = 'pass' | 'fail' | 'not-reproduced';

export interface C2ArmVerdict {
  arm: C2Arm;
  outcome: C2Outcome;
  reasons: string[];
  lateRefusals: number;
}

export function armVerdict(result: C2AttemptResult, { soloChatId, sandboxChatId }: { soloChatId: string; sandboxChatId: string }): C2ArmVerdict {
  const reasons: string[] = [];
  const fail = (reason: string) => ({ arm: result.arm, outcome: 'fail' as const, reasons: [...reasons, reason], lateRefusals: 0 });
  if (result.aborted) return fail(`refused to run: ${result.aborted}`);
  if (result.dialog) return fail(`a dialog was left open (the integrity wedge shape): ${result.dialog}`);
  if (result.ringAvailable !== true) return fail('the watcher refusal ring is absent: the page does not serve the dev bundle, so a refusal could not be seen');
  if (result.arm === 'guard' && result.wroteSetting !== true) return fail('the guard arm did not write the setting before /go');
  if (result.arm === 'control' && result.wroteSetting !== false) return fail('the control arm wrote the setting');
  if (result.openedAfterGo !== soloChatId) return fail(`/go opened ${result.openedAfterGo ?? 'nothing'}, not the run's solo chat ${soloChatId}`);
  if (!result.backInSandbox) reasons.push('the page did not return to the sandbox chat after the attempt');
  const before = result.soloBefore;
  const after = result.soloAfter;
  if (!before || !after || before.messages === null || after.messages === null) return fail('the solo chat could not be read from disk before and after');
  if ((before.messages ?? 0) < 2) return fail(`the solo chat holds ${before.messages} message(s): the populated-solo case needs at least 2`);
  if (before.messages !== after.messages || before.digest !== after.digest) return fail(`the solo chat changed on disk: ${before.messages} -> ${after.messages} message(s)`);
  const refusals = result.refusals ?? [];
  const late = refusals.filter((refusal) => refusal.file === soloChatId && refusal.askedFor === sandboxChatId);
  const ofSolo = refusals.filter((refusal) => refusal.file === soloChatId);
  if (result.arm === 'control') {
    if (ofSolo.length) return { ...fail(`a save of the solo chat was refused with no save of ours asked for: ${ofSolo.map((refusal) => refusal.reason).join('; ')}`), lateRefusals: late.length };
    return { arm: 'control', outcome: reasons.length ? 'fail' : 'pass', reasons, lateRefusals: 0 };
  }
  if (!late.length) return { arm: 'guard', outcome: 'not-reproduced', reasons: [...reasons, 'no late-bound save of ours reached the solo chat this attempt, so the guard was not exercised'], lateRefusals: 0 };
  if (late.some((refusal) => !(refusal.rows > 0))) reasons.push('a refused late save carried no rows: that is the old empty-save case, not the populated one');
  if (result.healthAfterNext?.lastOutcome === 'unsaved') reasons.push('the next persist in the sandbox chat was lost too');
  return { arm: 'guard', outcome: reasons.length ? 'fail' : 'pass', reasons, lateRefusals: late.length };
}

export interface C2Verdict {
  ok: boolean;
  status: 'green' | 'red' | 'not-reproduced';
  guard: C2ArmVerdict[];
  control: C2ArmVerdict[];
  problems: string[];
}

export function c2Verdict(verdicts: C2ArmVerdict[], { runs = 2 }: { runs?: number } = {}): C2Verdict {
  const guard = verdicts.filter((verdict) => verdict.arm === 'guard');
  const control = verdicts.filter((verdict) => verdict.arm === 'control');
  const problems: string[] = [];
  if (guard.length < runs) problems.push(`${guard.length} guard attempt(s), fewer than ${runs}`);
  if (control.length < runs) problems.push(`${control.length} control attempt(s), fewer than ${runs}`);
  for (const [index, verdict] of verdicts.entries()) if (verdict.outcome === 'fail') problems.push(`attempt ${index + 1} (${verdict.arm}): ${verdict.reasons.join('; ')}`);
  const failed = verdicts.some((verdict) => verdict.outcome === 'fail');
  const unreproduced = guard.some((verdict) => verdict.outcome === 'not-reproduced');
  if (!failed && unreproduced) problems.push(`${guard.filter((verdict) => verdict.outcome === 'not-reproduced').length} guard attempt(s) did not reproduce the late save: the guard is unexercised there, not green`);
  const status = failed || problems.some((line) => line.includes('fewer than')) ? 'red' : unreproduced ? 'not-reproduced' : 'green';
  return { ok: status === 'green', status, guard, control, problems };
}

export function attemptPlan(attempts: number): C2Arm[] {
  return Array.from({ length: attempts * 2 }, (_, index) => (index % 2 === 0 ? 'guard' : 'control'));
}

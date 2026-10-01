import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C2_STORY, armVerdict, attemptPlan, attemptRefusal, c2Verdict, type C2AttemptResult, type C2Guard } from './c2SaveRace.mts';
import { cleanupIssues, runAttempt } from '../so-c2-save-race.mts';

const solo = { chatId: 'Ponticius - 2026-10-01@10h00m00s000ms', avatar: 'Ponticius.png', name: 'Ponticius' };
const guard = (over: Partial<C2Guard> = {}): C2Guard => ({ groupId: 'g1', sandboxChatId: 'sandbox-new', owned: ['sandbox-new', solo.chatId], preexisting: ['old-chat'], soloChats: [solo], ...over });
const live = (over = {}) => ({ groupId: 'g1', chatId: 'sandbox-new', storyId: C2_STORY.id, ...over });
const ids = { soloChatId: solo.chatId, sandboxChatId: 'sandbox-new' };

const attempt = (arm: 'guard' | 'control', over: Partial<C2AttemptResult> = {}): C2AttemptResult => ({
  arm,
  dialog: null,
  ringAvailable: true,
  wroteSetting: arm === 'guard',
  soloBefore: { messages: 3, digest: 'a' },
  soloAfter: { messages: 3, digest: 'a' },
  openedAfterGo: solo.chatId,
  backInSandbox: true,
  refusals: arm === 'guard' ? [{ seq: 4, file: solo.chatId, rows: 3, askedFor: 'sandbox-new', open: solo.chatId, reason: 'late-bound save of ours' }] : [],
  healthAfterSwitch: { lastOutcome: 'unsaved' },
  healthAfterNext: { lastOutcome: 'applied' },
  ...over,
});

test('the attempt runs only on the sandbox and solo chats this run created (positive control)', () => {
  assert.equal(attemptRefusal(guard(), live(), solo), null);
});

test('negative control: C2 refuses a chat it did not create, the wrong page, a foreign story and a borrowed solo chat', () => {
  const cases: Array<[string | null, RegExp]> = [
    [attemptRefusal(null, live(), solo), /C2 runs only in a chat it created/],
    [attemptRefusal(guard({ preexisting: ['sandbox-new'] }), live(), solo), /existed before the run/],
    [attemptRefusal(guard({ owned: [solo.chatId] }), live(), solo), /not owned by this run/],
    [attemptRefusal(guard(), live({ chatId: '2026-09-26@02h04m03s354ms' }), solo), /not the run's sandbox/],
    [attemptRefusal(guard(), live({ groupId: '1759606632088' }), solo), /not the run's sandbox/],
    [attemptRefusal(guard(), live({ storyId: 'so-v25-c2c1' }), solo), /plays so-v25-c2c1, not so-c2-save-race/],
    [attemptRefusal(guard(), live(), null), /no solo chat/],
    [attemptRefusal(guard(), live(), { chatId: 'Ponticius - 2025-10-27 @11h 06m 58s 578ms' }), /was not created by this run/],
  ];
  for (const [reason, needle] of cases) assert.match(reason ?? '', needle);
});

test('negative control: runAttempt never touches the page beyond a read when the run did not create the open chat', async () => {
  const calls: string[] = [];
  const page = { evaluate: async (fn: () => unknown) => { calls.push(String(fn).includes('executeSlashCommandsWithOptions') ? 'attempt' : 'read'); return { groupId: 'g1', chatId: '2026-09-26@02h04m03s354ms', storyId: 'so-v25-c2c1' }; } };
  const result = await runAttempt(page as never, 'guard', { guard: guard(), solo });
  assert.match(result.aborted ?? '', /not the run's sandbox/);
  assert.deepEqual(calls, ['read']);
  assert.equal(armVerdict(result, ids).outcome, 'fail');
});

test('the guard arm passes when our late save into the populated solo chat is refused and the solo rows are unchanged', () => {
  assert.deepEqual(armVerdict(attempt('guard'), ids), { arm: 'guard', outcome: 'pass', reasons: [], lateRefusals: 1 });
});

test('negative control: the guard arm fails when the solo chat changed on disk, and is not green when the race never happened', () => {
  assert.match(armVerdict(attempt('guard', { soloAfter: { messages: 0, digest: '' } }), ids).reasons.join(), /changed on disk: 3 -> 0/);
  assert.match(armVerdict(attempt('guard', { soloAfter: { messages: 3, digest: 'b' } }), ids).reasons.join(), /changed on disk/);
  const quiet = armVerdict(attempt('guard', { refusals: [] }), ids);
  assert.equal(quiet.outcome, 'not-reproduced');
  assert.equal(armVerdict(attempt('guard', { refusals: [{ seq: 1, file: solo.chatId, rows: 0, askedFor: 'sandbox-new', open: solo.chatId, reason: 'empty' }] }), ids).outcome, 'fail');
  assert.match(armVerdict(attempt('guard', { healthAfterNext: { lastOutcome: 'unsaved' } }), ids).reasons.join(), /next persist .* was lost too/);
  assert.match(armVerdict(attempt('guard', { wroteSetting: false }), ids).reasons.join(), /did not write the setting/);
  assert.match(armVerdict(attempt('guard', { ringAvailable: false }), ids).reasons.join(), /dev bundle/);
  assert.match(armVerdict(attempt('guard', { soloBefore: { messages: 1, digest: 'g' }, soloAfter: { messages: 1, digest: 'g' } }), ids).reasons.join(), /needs at least 2/);
  assert.match(armVerdict(attempt('guard', { openedAfterGo: 'Ponticius - an old chat' }), ids).reasons.join(), /not the run's solo chat/);
  assert.match(armVerdict(attempt('guard', { dialog: 'Chat integrity check failed' }), ids).reasons.join(), /integrity wedge/);
});

test('the control arm passes with no refusal of the solo chat, and fails when ST\'s own save of it is held back', () => {
  assert.equal(armVerdict(attempt('control'), ids).outcome, 'pass');
  const blocked = armVerdict(attempt('control', { refusals: [{ seq: 9, file: solo.chatId, rows: 3, askedFor: null, open: solo.chatId, reason: 'refused' }] }), ids);
  assert.equal(blocked.outcome, 'fail');
  assert.match(blocked.reasons.join(), /refused with no save of ours asked for/);
  assert.match(armVerdict(attempt('control', { wroteSetting: true }), ids).reasons.join(), /control arm wrote the setting/);
});

test('C2 is green only when every guard attempt fired and every control passed, ×2 each', () => {
  const plan = attemptPlan(2);
  assert.deepEqual(plan, ['guard', 'control', 'guard', 'control']);
  const green = c2Verdict(plan.map((arm) => armVerdict(attempt(arm), ids)), { runs: 2 });
  assert.deepEqual([green.ok, green.status, green.problems], [true, 'green', []]);
  const once = c2Verdict([armVerdict(attempt('guard'), ids), armVerdict(attempt('control'), ids)], { runs: 2 });
  assert.equal(once.status, 'red');
  const unexercised = c2Verdict([attempt('guard', { refusals: [] }), attempt('control'), attempt('guard'), attempt('control')].map((entry) => armVerdict(entry, ids)), { runs: 2 });
  assert.deepEqual([unexercised.ok, unexercised.status], [false, 'not-reproduced']);
  const failed = c2Verdict([attempt('guard'), attempt('control', { soloAfter: { messages: 2, digest: 'x' } }), attempt('guard'), attempt('control')].map((entry) => armVerdict(entry, ids)), { runs: 2 });
  assert.deepEqual([failed.ok, failed.status], [false, 'red']);
});

test('the cleanup gate reads every leak the sandbox cleanup can report', () => {
  assert.deepEqual(cleanupIssues({ generation: { idle: true }, deleted: ['sandbox-new'], notDeleted: [], soloChats: { deleted: [solo.chatId], leaked: [] }, activeEntity: { restored: true }, library: { changed: true }, reapPrompts: { dismissed: [], leaked: [] } }), []);
  assert.deepEqual(cleanupIssues(null), ['no cleanup ran']);
  const leaky = cleanupIssues({ generation: { error: 'generation did not stop' }, notDeleted: ['sandbox-new'], soloChats: { leaked: [solo.chatId] }, activeEntity: { restored: false }, library: { error: 'save failed' }, reapPrompts: { leaked: ['x'] } });
  assert.equal(leaky.length, 6);
});

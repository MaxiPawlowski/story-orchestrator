// v2.4 plan 02 §10 (X11): the identity verbs, driven through the shipped functions against a fake page
// whose `evaluate` runs the closure in-process with the host stubbed on globalThis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adoptBranchChat, branchChatReport, branchCommand, branchCreate, branchSpec, cleanupBranchChats, expectNextReadWindow, expectRollbackOutcome,
  nextReadWindowFailures, nextReadWindowSpec, rollbackOutcomeFailures, rollbackOutcomeSpec, settleReapPrompts, withoutBranchChats, type RollbackRecord,
} from './identityVerbs.mts';
import { recordState } from './interopVerbs.mts';
import { validateSteps } from './scenarioSchema.mts';
import { runSteps } from '../so-scenario.mts';

const g = globalThis as Record<string, any>;
const page = { evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) };
const record = (seq: number, result: RollbackRecord['result'], fromMessage: number | null = 3): RollbackRecord => ({ seq, result, fromMessage, at: 't' });

test('rollbackOutcome: the spec is closed, and "none" cannot be asked without a mark', () => {
  assert.deepEqual(rollbackOutcomeSpec({ result: 'applied', fromMessage: 1, since: 'mark' }), { result: 'applied', fromMessage: 1, since: 'mark' });
  assert.throws(() => rollbackOutcomeSpec({ result: 'rewound' }), /expected one of applied, noop, history-unavailable, none/);
  assert.throws(() => rollbackOutcomeSpec({ result: 'none' }), /needs `since`/);
  assert.throws(() => rollbackOutcomeSpec({ result: 'none', since: 'm', fromMessage: 2 }), /takes no fromMessage/);
  assert.throws(() => rollbackOutcomeSpec({ result: 'applied', fromMessage: '1' }), /integer message id/);
});

test('rollbackOutcome: only a rollback newer than the mark counts', () => {
  assert.deepEqual(rollbackOutcomeFailures({ result: 'none', since: 'm' }, record(2, 'applied'), 2), []);
  assert.match(rollbackOutcomeFailures({ result: 'none', since: 'm' }, record(3, 'applied', 1), 2).join(), /expected no rollback since "m", got applied from 1/);
  assert.match(rollbackOutcomeFailures({ result: 'applied', since: 'm' }, record(2, 'applied'), 2).join(), /but no rollback ran \(the last one was applied from 3/);
  assert.match(rollbackOutcomeFailures({ result: 'applied' }, null, null).join(), /no rollback ran$/);
});

test('rollbackOutcome: result, start and reason are each checked, and each failure names what it saw', () => {
  assert.deepEqual(rollbackOutcomeFailures({ result: 'applied', fromMessage: 3 }, record(1, 'applied'), null), []);
  assert.match(rollbackOutcomeFailures({ result: 'applied', fromMessage: 1 }, record(1, 'applied', 2), null).join(), /start at message 1, it started at 2/);
  assert.match(rollbackOutcomeFailures({ result: 'noop' }, record(1, 'applied'), null).join(), /expected a noop rollback, got applied/);
  assert.match(rollbackOutcomeFailures({ result: 'history-unavailable', reason: 'oldest' }, { ...record(1, 'history-unavailable'), reason: 'oldest restorable boundary 4 (message 9)' }, null).join(), /^$/);
  assert.match(rollbackOutcomeFailures({ result: 'noop', reason: 'no usable' }, record(1, 'noop'), null).join(), /reason to contain "no usable", got null/);
});

const fakeRuntime = (notices: unknown) => {
  g.storyOrchestratorRuntime = {
    notices,
    getEngineState: () => ({ blackboard: { values: { a: true }, versions: {} }, activeCheckpointId: 'start', visitedPath: ['start'], boundary: 2 }),
    getSnapshot: () => ({ memory: { entries: [] } }),
    getEpistemic: () => [],
    getLedger: () => [],
  };
};

test('record_state marks the rollback seq, and expect.rollbackOutcome reads the runtime notices against it', async () => {
  delete g.__soRecordedStates;
  const notices: { lastRollback: null; rollbackUnavailable: null; lastOutcome?: RollbackRecord } = { lastRollback: null, rollbackUnavailable: null, lastOutcome: record(4, 'noop') };
  fakeRuntime(notices);
  await recordState(page as never, { as: 'mark' });
  assert.equal(g.__soRecordedStates.mark.rollbackSeq, 4);
  await expectRollbackOutcome(page as never, { result: 'none', since: 'mark' });
  notices.lastOutcome = record(5, 'applied', 1);
  await assert.rejects(expectRollbackOutcome(page as never, { result: 'none', since: 'mark' }), /expected no rollback since "mark", got applied from 1/);
  const passed = await expectRollbackOutcome(page as never, { result: 'applied', fromMessage: 1, since: 'mark' });
  assert.equal(passed.sinceSeq, 4);
  await assert.rejects(expectRollbackOutcome(page as never, { result: 'applied', since: 'other' }), /nothing was recorded as "other"/);
});

test('control: a build that keeps no notices is refused, not read as "no rollback ran"', async () => {
  g.storyOrchestratorRuntime = {};
  g.__soRecordedStates = { mark: { rollbackSeq: 0 } };
  await assert.rejects(expectRollbackOutcome(page as never, { result: 'none', since: 'mark' }), /exposes no notices/);
});

const window = (from: number, to: number, ids: number[]) => ({ source: 'cadence', reason: 'cadence', window: { from, to, messages: ids.map((messageId) => ({ messageId })) } });

test('nextReadWindow: the spec must name something to check', () => {
  assert.deepEqual(nextReadWindowSpec({ excludes: [1] }), { excludes: [1] });
  assert.throws(() => nextReadWindowSpec({}), /name includes or excludes/);
  assert.throws(() => nextReadWindowSpec({ includes: [] }), /non-empty list/);
  assert.throws(() => nextReadWindowSpec({ exclude: [1] }), /unknown key exclude/);
});

test('nextReadWindow: an empty window or one outside the chat fails instead of passing vacuously', () => {
  assert.match(nextReadWindowFailures({ excludes: [1] }, null, 4).join(), /no next read/);
  assert.match(nextReadWindowFailures({ excludes: [1] }, window(2, 3, []), 4).join(), /is empty \(2\.\.3\)/);
  assert.match(nextReadWindowFailures({ excludes: [1] }, window(3, 2, [2]), 4).join(), /is empty/);
  assert.match(nextReadWindowFailures({ excludes: [1] }, window(0, 5, [0, 5]), 4).join(), /outside the chat \(length 4\)/);
});

test('nextReadWindow: a hidden message in the range but not in the messages is excluded; a read one is not', () => {
  assert.deepEqual(nextReadWindowFailures({ excludes: [1], includes: [0, 2] }, window(0, 2, [0, 2]), 3), []);
  assert.match(nextReadWindowFailures({ excludes: [1] }, window(0, 2, [0, 1, 2]), 3).join(), /still reads message\(s\) 1/);
  assert.match(nextReadWindowFailures({ includes: [1] }, window(0, 2, [0, 2]), 3).join(), /leaves out message\(s\) 1 \(it reads 0, 2\)/);
});

test('expect.nextReadWindow asks the runtime scheduler, and refuses a build without one', async () => {
  g.SillyTavern = { getContext: () => ({ chat: [{}, {}, {}] }) };
  g.storyOrchestratorScheduler = { nextReadWindow: () => window(0, 2, [0, 2]) };
  assert.deepEqual(await expectNextReadWindow(page as never, { excludes: [1] }), { nextReadWindow: { excludes: [1] }, source: 'cadence', from: 0, to: 2, reads: [0, 2] });
  delete g.storyOrchestratorScheduler;
  await assert.rejects(expectNextReadWindow(page as never, { excludes: [1] }), /exposes no storyOrchestratorScheduler/);
});

test('branch_create: the spec, and the command it becomes', () => {
  assert.deepEqual(branchSpec(3), { mesId: 3, kind: 'branch', open: true });
  assert.deepEqual(branchSpec({ kind: 'checkpoint', mesId: 2, name: 'cp one' }), { mesId: 2, kind: 'checkpoint', name: 'cp one', open: false });
  assert.equal(branchCommand(branchSpec({ mesId: 'last' }), 5), '/branch-create 5');
  assert.equal(branchCommand(branchSpec({ kind: 'checkpoint', mesId: 2, name: 'cp one' }), 5), '/checkpoint-create mesId=2 cp one');
  assert.equal(branchCommand(branchSpec({ kind: 'checkpoint', mesId: 2 }), 5), '/checkpoint-create mesId=2');
  assert.throws(() => branchSpec({ mesId: -1 }), /message id or "last"/);
  assert.throws(() => branchSpec({ name: 'x' }), /only a checkpoint takes a name/);
  assert.throws(() => branchSpec({ kind: 'checkpoint', name: 'a | /delchat' }), /only, so the slash command cannot misparse it/);
  assert.throws(() => branchSpec({ open: false }), /always opens/);
  assert.throws(() => branchCommand(branchSpec({}), -1), /no message to branch from/);
});

test('a branch is adopted only when it is new and in the pinned group, and it is recorded once', () => {
  const guard = { groupId: 'g1', owned: ['sandbox'], preexisting: ['main'], branchChats: [] as string[] };
  const spec = branchSpec(2);
  assert.deepEqual(adoptBranchChat(guard, spec, { name: 'sandbox - Branch #1', groupId: 'g1', chatId: 'sandbox - Branch #1' }).branchChats, ['sandbox - Branch #1']);
  adoptBranchChat(guard, spec, { name: 'sandbox - Branch #1', groupId: 'g1', chatId: 'sandbox - Branch #1' });
  assert.deepEqual(guard.owned, ['sandbox', 'sandbox - Branch #1']);
  assert.deepEqual(guard.branchChats, ['sandbox - Branch #1']);
  assert.throws(() => adoptBranchChat(guard, spec, { name: 'main', groupId: 'g1', chatId: 'main' }), /existed before the run/);
  assert.throws(() => adoptBranchChat(guard, spec, { name: 'x', groupId: 'g2', chatId: 'x' }), /left the sandbox group/);
  assert.throws(() => adoptBranchChat(guard, spec, { name: '', groupId: 'g1', chatId: 'sandbox' }), /created no branch/);
  assert.throws(() => adoptBranchChat(guard, spec, { name: 'y', groupId: 'g1', chatId: 'sandbox' }), /expected the page on "y"/);
  assert.deepEqual(guard.owned, ['sandbox', 'sandbox - Branch #1'], 'a refused branch is never adopted');
});

test('branch_create runs the host command, follows a checkpoint it is told to open, and records it', async () => {
  const commands: string[] = [];
  const state = { groupId: 'g1', chatId: 'sandbox', chat: [{}, {}, {}] };
  g.SillyTavern = {
    getContext: () => ({
      ...state,
      executeSlashCommandsWithOptions: async (command: string) => { commands.push(command); return { pipe: 'cp one' }; },
      openGroupChat: async (_group: string, name: string) => { state.chatId = name; },
    }),
  };
  const guard = { groupId: 'g1', owned: ['sandbox'], preexisting: [], branchChats: [] as string[] };
  const out = await branchCreate(page as never, { kind: 'checkpoint', mesId: 1, name: 'cp one', open: true }, guard);
  assert.deepEqual(commands, ['/checkpoint-create mesId=1 cp one']);
  assert.equal(state.chatId, 'cp one');
  assert.deepEqual(out, { command: '/checkpoint-create mesId=1 cp one', name: 'cp one', kind: 'checkpoint', opened: true, branchChats: ['cp one'] });
  await assert.rejects(branchCreate(page as never, 1, null), /needs --sandbox/);
  state.groupId = 'other';
  await assert.rejects(branchCreate(page as never, 1, guard), /not on the sandbox group \(other\)/);
});

test('branch chat report: a recorded name still present is a leak, a failed attempt is failed', () => {
  assert.deepEqual(branchChatReport(['a', 'b'], [{ name: 'a', ok: true }, { name: 'b', ok: false }], ['b']), { recorded: ['a', 'b'], deleted: ['a'], failed: ['b'], leaked: ['b'] });
  assert.deepEqual(branchChatReport([], [], []), { recorded: [], deleted: [], failed: [], leaked: [] });
});

const withServer = (listed: string[], files: Set<string>) => {
  g.SillyTavern = { getContext: () => ({ groupId: 'g1', chatId: 'sandbox', getRequestHeaders: () => ({}) }) };
  g.fetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const answer = url === '/api/groups/all' ? [{ id: 'g1', chats: [...listed] }] : url === '/api/chats/group/get' ? (files.has(body.id) ? [{}, {}] : []) : null;
    return { ok: true, status: 200, json: async () => answer };
  };
};

test('branch cleanup deletes only the recorded names still present, and reads the server back', async () => {
  const listed = ['sandbox', 'b1', 'foreign'];
  const files = new Set(['b1', 'b2', 'foreign']);
  withServer(listed, files);
  const deleted: string[] = [];
  const cleanupPage = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: { names?: string[] }) => {
      if (!String(fn).includes('group-chats.js')) return fn(arg);
      for (const name of arg.names ?? []) {
        deleted.push(name);
        if (listed.includes(name)) listed.splice(listed.indexOf(name), 1);
        files.delete(name);
      }
      return (arg.names ?? []).map((name) => ({ name, ok: true }));
    },
  };
  const report = await cleanupBranchChats(cleanupPage as never, { groupId: 'g1', owned: [], preexisting: [], branchChats: ['b0', 'b1', 'b2'] }, { settleMs: 0 });
  assert.deepEqual(deleted, ['b1', 'b2'], 'b0 was already gone and the foreign chat was never recorded');
  assert.deepEqual(report, { recorded: ['b0', 'b1', 'b2'], deleted: ['b0', 'b1', 'b2'], failed: [], leaked: [] });
  assert.ok(listed.includes('foreign') && files.has('foreign'));
});

test('control: a branch the delete could not remove is reported leaked, which the journey tally fails on', async () => {
  withServer(['b1'], new Set(['b1']));
  const stubborn = { evaluate: async (fn: (arg: unknown) => unknown, arg: { names?: string[] }) => (String(fn).includes('group-chats.js') ? (arg.names ?? []).map((name) => ({ name, ok: false })) : fn(arg)) };
  const report = await cleanupBranchChats(stubborn as never, { groupId: 'g1', owned: [], preexisting: [], branchChats: ['b1'] }, { settleMs: 0 });
  assert.deepEqual(report, { recorded: ['b1'], deleted: [], failed: ['b1'], leaked: ['b1'] });
  const { readCleanup } = await import('./journeyTallies.mts');
  assert.equal(readCleanup({ branchChats: report }).ok, false);
});

test('the closed vocabulary knows the new verbs and refuses their bad shapes before a run', () => {
  assert.deepEqual(validateSteps([
    { branch_create: { mesId: 2 } },
    { branch_create: { kind: 'checkpoint', mesId: 1, name: 'cp', open: true } },
    { ui: { action: 'branch-continue' } },
    { expect: { rollbackOutcome: { result: 'none', since: 'm' }, nextReadWindow: { excludes: [1] } } },
  ]), []);
  const problems = validateSteps([
    { branch_create: { kind: 'fork' } },
    { expect: { rollbackOutcome: { result: 'none' } } },
    { expect: { nextReadWindow: { includes: [] } } },
    { expect: { rollbackOutcom: { result: 'applied' } } },
  ]);
  assert.equal(problems.length, 4);
  assert.match(problems[0], /steps\[0\]\.branch_create: .*"branch" or "checkpoint"/);
  assert.match(problems[1], /steps\[1\]\.expect\.rollbackOutcome: .*needs `since`/);
  assert.match(problems[2], /steps\[2\]\.expect\.nextReadWindow: .*non-empty list/);
  assert.match(problems[3], /unknown key "rollbackOutcom" \(did you mean "rollbackOutcome"\?\)/);
});

test('runSteps dispatches the new verbs: branch_create without a sandbox and an unmet rollbackOutcome both fail their step', async () => {
  const log = console.log;
  console.log = () => undefined;
  try {
    const noSandbox = await runSteps(page as never, [{ branch_create: 1 }] as never, {} as never);
    assert.equal(noSandbox.ok, false);
    assert.match(noSandbox.error ?? '', /branch_create needs --sandbox/);
    g.storyOrchestratorRuntime = { notices: { lastOutcome: record(1, 'applied', 2) } };
    const unmet = await runSteps(page as never, [{ expect: { rollbackOutcome: { result: 'noop' } } }] as never, {} as never);
    assert.equal(unmet.ok, false);
    assert.match(unmet.error ?? '', /expected a noop rollback, got applied from 2/);
    const met = await runSteps(page as never, [{ expect: { rollbackOutcome: { result: 'applied', fromMessage: 2 } } }] as never, {} as never);
    assert.equal(met.ok, true, met.error ?? '');
  } finally {
    console.log = log;
  }
});

// v2.4 T14: ST popups as the product raises them, one at a time; `cancel` closes the dialog and lets the
// product ask its next question, the way the serialised reaper does.
const fakeDialogs = (texts: string[], { stuck = false } = {}) => {
  const open: Array<Record<string, unknown>> = [];
  const clicked: string[] = [];
  const raise = (text: string) => {
    const dialog: Record<string, unknown> = {};
    dialog.querySelector = (selector: string) => (selector === '.popup-content'
      ? { textContent: text }
      : { click: () => {
        clicked.push(text);
        if (stuck) return;
        open.splice(open.indexOf(dialog), 1);
        const next = queue.shift();
        if (next) raise(next);
      } });
    open.push(dialog);
  };
  const queue = [...texts];
  raise(queue.shift() as string);
  g.document = { querySelectorAll: (selector: string) => (selector === 'dialog[open]' ? [...open] : []) };
  return { open, clicked };
};

test('reap prompts: every question naming an owned chat is declined in turn, and a foreign popup is left alone', async () => {
  const world = fakeDialogs([
    'The chat "sb-1" was deleted, but its story-memory lorebook "Story Orchestrator - X - sb-1" is still there.',
    'The chat "sb-2" was deleted, but its story-memory lorebook "Story Orchestrator - X - sb-2" is still there.',
  ]);
  world.open.push({ querySelector: (selector: string) => (selector === '.popup-content' ? { textContent: 'The chat "users-own" was deleted, but …' } : { click: () => assert.fail('a foreign question was answered') }) });
  try {
    const report = await settleReapPrompts(page as never, ['sb-1', 'sb-2'], { quietMs: 60, timeoutMs: 2000, pollMs: 5 });
    assert.equal(report.dismissed.length, 2);
    assert.deepEqual(report.leaked, []);
    assert.equal(world.open.length, 1, 'the foreign popup stays open');
  } finally {
    delete g.document;
  }
});

test('control: a reap question that will not close is reported leaked, which fails the cleanup tally', async () => {
  fakeDialogs(['The chat "sb-1" was deleted, but its story-memory lorebook "Story Orchestrator - X - sb-1" is still there.'], { stuck: true });
  try {
    const report = await settleReapPrompts(page as never, ['sb-1'], { quietMs: 60, timeoutMs: 300, pollMs: 5 });
    assert.equal(report.dismissed.length, 1, 'answered once, not once per poll');
    assert.equal(report.leaked.length, 1);
    const { readCleanup } = await import('./journeyTallies.mts');
    assert.equal(readCleanup({ reapPrompts: report }).ok, false);
  } finally {
    delete g.document;
  }
});

test('reap prompts: nothing owned means nothing is read', async () => {
  const touched = { evaluate: async () => assert.fail('the page was read') };
  assert.deepEqual(await settleReapPrompts(touched as never, []), { dismissed: [], leaked: [] });
});

test('withoutBranchChats: the sandbox delete skips recorded branches and leaves the guard itself untouched', () => {
  const guard = { groupId: 'g', owned: ['sandbox', 'sandbox - Branch #1', 'second'], preexisting: [], branchChats: ['sandbox - Branch #1'] };
  assert.deepEqual(withoutBranchChats(guard).owned, ['sandbox', 'second']);
  assert.deepEqual(guard.owned, ['sandbox', 'sandbox - Branch #1', 'second']);
  assert.deepEqual(withoutBranchChats({ owned: ['sandbox'] }).owned, ['sandbox']);
});

test('branch_create returns only once the opened branch holds its messages (ST names the chat before it loads them)', async () => {
  const state: { groupId: string; chatId: string; chat: unknown[] } = { groupId: 'g1', chatId: 'sandbox', chat: [{}, {}, {}] };
  g.SillyTavern = {
    getContext: () => ({
      ...state,
      executeSlashCommandsWithOptions: async () => {
        state.chatId = 'sandbox - Branch #1';
        state.chat = [];
        setTimeout(() => { state.chat = [{}, {}]; }, 300);
        return { pipe: 'sandbox - Branch #1' };
      },
    }),
  };
  const guard = { groupId: 'g1', owned: ['sandbox'], preexisting: [], branchChats: [] as string[] };
  await branchCreate(page as never, { mesId: 1 }, guard);
  assert.equal(state.chat.length, 2);
});

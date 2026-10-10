import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bridgeEvidenceProblems, driveWizardAgent, textOnlyRefusal, UI_RUNNER_HANDLES } from './wizardAgentDrive.mts';

const page = { evaluate: async (fn: any, arg: any) => fn(arg) };
const input = { goal: 'a courier', title: 'SO-W11 test', mode: 'review', route: 'harness' as const, maxSteps: 4, provision: 'reject' as const };

function install(transport: (() => Promise<any>) | null, omit: string[] = []) {
  const calls: string[] = [];
  let draft: any = { title: '' };
  (globalThis as any).storyOrchestratorRuntime = { model: {}, getProvisioningEnvironment: () => ({}), applyProvisioning: async () => ({ ok: true }) };
  (globalThis as any).storyOrchestratorStudioDraft = { getState: () => ({ draft, newDraft: () => { draft = { title: '' }; }, mutate: (fn: any) => { draft = fn(draft); } }) };
  const agent: Record<string, any> = {
    newAgentSession: () => ({ status: 'awaiting-plan', plan: ['p'], steps: [] }),
    approvePlan: (session: any) => ({ ...session, status: 'running' }),
    pendingStep: () => null,
    decideStep: (session: any) => ({ session }),
    resolveProvisioning: (session: any) => session,
    applyDraftOp: (current: any, op: any) => ({ ...current, ops: [...(current.ops ?? []), op] }),
    applyProvisioningFollowUps: (current: any) => current,
    validationErrorCount: () => 0,
    resolveAgentHarness: async () => { calls.push('resolve'); return transport ? transport() : null; },
    createAgentRunner: ({ harness }: any) => {
      let open: string | null = null;
      let pending: string | null = null;
      let turns = 0;
      const runner: any = async (session: any) => {
        calls.push('runner');
        const chosen = await harness();
        turns += 1;
        if (chosen?.bridge) {
          if (!open) { const opened = await chosen.bridge.open({ tools: [{}, {}] }); open = opened.sessionId; }
          const event = await chosen.bridge.nextCall(open, Date.now() + 1000);
          if (event.kind === 'call') pending = event.callId;
          if (event.kind === 'done') open = null;
        }
        const done = turns >= 2;
        return { session: { ...session, status: done ? 'done' : 'running', steps: [...session.steps, { status: 'applied' }] }, apply: { kind: 'setTitle', n: turns } };
      };
      runner.settle = async () => { if (open && pending) { const answering = pending; pending = null; await (await harness()).bridge.answer(open, answering, { ok: true, text: 'applied' }); } };
      runner.close = async () => { if (open) { const closing = open; open = null; await (await harness()).bridge.close(closing); } };
      return runner;
    },
    driveAgent: async (start: any, deps: any) => {
      calls.push('drive');
      let current = start;
      try {
        while (current.status === 'running') {
          const result = await deps.runner(current, deps.draft());
          if (result.apply) deps.applyOp(result.apply);
          current = result.session;
          deps.commit(current);
          await deps.runner.settle?.(result);
        }
        return { session: current, lapsed: null };
      } finally {
        await deps.runner.close?.();
      }
    },
  };
  for (const name of omit) delete agent[name];
  (globalThis as any).storyOrchestratorWizardAgent = agent;
  return calls;
}

const fakeBridge = () => {
  let next = 0;
  return {
    bridge: {
      open: async () => ({ ok: true, sessionId: 's1' }),
      nextCall: async () => (next++ === 0 ? { kind: 'call', callId: 'c1', tool: 'so_set_title', args: {} } : { kind: 'done', text: '{"done":true}' }),
      answer: async () => true,
      close: async () => true,
    },
    target: { harness: 'opencode', model: 'm', timeoutMs: 1000 },
  };
};

afterEach(() => {
  for (const name of ['storyOrchestratorRuntime', 'storyOrchestratorStudioDraft', 'storyOrchestratorWizardAgent']) delete (globalThis as any)[name];
});

test('AS-21 wizard drive: the measurement goes through the Studio runner and its bridge resolver, and records native bridge traffic', async () => {
  const shared = fakeBridge();
  const calls = install(async () => shared);
  const result = await driveWizardAgent(page, input);
  assert.ok(calls.includes('resolve') && calls.includes('drive') && calls.includes('runner'));
  assert.equal(result.bridge.transport, 'bridge');
  assert.deepEqual(result.bridge.events.map((event) => event.op), ['open', 'next', 'answer', 'next']);
  assert.deepEqual(bridgeEvidenceProblems('harness', result.bridge), []);
  assert.equal(result.replayMatches, true);
  assert.equal(result.session.status, 'done');
});

test('AS-21 wizard drive: a build without the resolver handle is refused, not silently run on the local route', async () => {
  install(null, ['resolveAgentHarness']);
  await assert.rejects(driveWizardAgent(page, input), /lacks resolveAgentHarness/);
  assert.ok(UI_RUNNER_HANDLES.includes('driveAgent'));
});

test('AS-21 wizard drive: --route harness without a routed bridge, or with a refusal, is a failed measurement', async () => {
  install(null);
  const none = await driveWizardAgent(page, input);
  assert.match(bridgeEvidenceProblems('harness', none.bridge)[0], /needs the native tool bridge/);
  assert.deepEqual(bridgeEvidenceProblems('local', none.bridge), []);
  install(async () => ({ refusal: 'the harness plugin does not list opencode' }));
  const refused = await driveWizardAgent(page, { ...input, maxSteps: 1 });
  assert.match(bridgeEvidenceProblems('harness', refused.bridge)[0], /refused the harness route: the harness plugin does not list opencode/);
});

test('AS-21 wizard drive: bridge evidence names an unanswered call and a session never closed', () => {
  const problems = bridgeEvidenceProblems('harness', {
    transport: 'bridge', refusal: null,
    events: [{ op: 'open', ok: true, sessionId: 's1' }, { op: 'next', sessionId: 's1', kind: 'call', tool: 'so_x', callId: 'c9' }],
  });
  assert.deepEqual(problems, ['no tool call was answered back over the bridge', 'tool call c9 (so_x) was never answered', 'bridge session s1 was never closed']);
});

test('v2.8 09 owner 2026-10-10: a plain-text refusal with no tool call is safe in the safety run, and only there', () => {
  const refusal = { transport: 'bridge' as const, refusal: null, events: [{ op: 'open' as const, ok: true, sessionId: 's1' }, { op: 'next' as const, sessionId: 's1', kind: 'done' }, { op: 'close' as const, sessionId: 's1' }] };
  assert.equal(textOnlyRefusal(refusal), true);
  assert.deepEqual(bridgeEvidenceProblems('harness', refusal, { textRefusalSafe: true }), []);
  assert.deepEqual(bridgeEvidenceProblems('harness', refusal), ['no native tool call reached the page', 'no tool call was answered back over the bridge']);
  const unanswered = { ...refusal, events: [...refusal.events, { op: 'next' as const, sessionId: 's1', kind: 'call', tool: 'so_x', callId: 'c1' }] };
  assert.equal(textOnlyRefusal(unanswered), false);
  assert.ok(bridgeEvidenceProblems('harness', unanswered, { textRefusalSafe: true }).includes('tool call c1 (so_x) was never answered'));
  const neverOpened = { transport: 'bridge' as const, refusal: null, events: [] };
  assert.deepEqual(bridgeEvidenceProblems('harness', neverOpened, { textRefusalSafe: true }), ['no bridge session opened', 'no native tool call reached the page', 'no tool call was answered back over the bridge']);
  const stalled = { transport: 'bridge' as const, refusal: null, events: [{ op: 'open' as const, ok: true, sessionId: 's1' }, { op: 'next' as const, sessionId: 's1', kind: 'ended' }] };
  assert.equal(textOnlyRefusal(stalled), false);
});

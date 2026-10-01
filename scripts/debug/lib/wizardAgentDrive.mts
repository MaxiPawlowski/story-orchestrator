import { evaluateInST } from './evaluate.mts';

export interface WizardDriveInput {
  goal: string;
  title: string;
  mode: string;
  route: 'local' | 'harness';
  maxSteps: number;
  provision: 'reject' | 'apply';
}

export interface BridgeEvent { op: 'open' | 'next' | 'answer' | 'close'; sessionId: string | null; ok?: boolean; kind?: string | null; tool?: string | null; callId?: string | null; delivered?: boolean; tools?: number }
export interface BridgeEvidence { transport: 'none' | 'refusal' | 'bridge' | 'text'; refusal: string | null; events: BridgeEvent[] }

export const UI_RUNNER_HANDLES = ['newAgentSession', 'approvePlan', 'pendingStep', 'decideStep', 'resolveProvisioning', 'applyDraftOp', 'applyProvisioningFollowUps', 'validationErrorCount', 'createAgentRunner', 'driveAgent', 'resolveAgentHarness'] as const;

export function driveWizardAgent(page: any, input: WizardDriveInput) {
  return evaluateInST(page, async ({ input, handles }: { input: WizardDriveInput; handles: readonly string[] }) => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const agent = (globalThis as any).storyOrchestratorWizardAgent;
    const store = (globalThis as any).storyOrchestratorStudioDraft;
    if (!rt?.model || !agent || !store) throw new Error('needs the dev bundle: storyOrchestratorRuntime.model, storyOrchestratorWizardAgent and the Studio draft store (open the Studio once)');
    const absent = handles.filter((name) => typeof agent[name] !== 'function');
    if (absent.length) throw new Error(`storyOrchestratorWizardAgent lacks ${absent.join(', ')}: this build does not expose the Studio's runner and bridge resolver; rebuild the dev bundle`);
    const bridge: BridgeEvidence = { transport: 'none', refusal: null, events: [] };
    const recording = (inner: any) => ({
      open: async (request: any) => {
        const result = await inner.open(request);
        bridge.events.push({ op: 'open', ok: Boolean(result?.ok), sessionId: result?.ok ? result.sessionId : null, kind: result?.ok ? null : result?.kind ?? null, tools: Array.isArray(request?.tools) ? request.tools.length : 0 });
        return result;
      },
      nextCall: async (sessionId: string, deadlineAt: number) => {
        const event = await inner.nextCall(sessionId, deadlineAt);
        bridge.events.push({ op: 'next', sessionId, kind: event?.kind ?? null, tool: event?.kind === 'call' ? event.tool : null, callId: event?.callId ?? null });
        return event;
      },
      answer: async (sessionId: string, callId: string, answer: any) => {
        const delivered = await inner.answer(sessionId, callId, answer);
        bridge.events.push({ op: 'answer', sessionId, callId, delivered: Boolean(delivered), ok: Boolean(answer?.ok) });
        return delivered;
      },
      close: async (sessionId: string) => {
        const closed = await inner.close(sessionId);
        bridge.events.push({ op: 'close', sessionId });
        return closed;
      },
    });
    const harness = async () => {
      const transport = await agent.resolveAgentHarness();
      if (!transport) { bridge.transport = 'none'; return null; }
      if (transport.refusal) { bridge.transport = 'refusal'; bridge.refusal = String(transport.refusal); return transport; }
      bridge.transport = transport.bridge ? 'bridge' : 'text';
      return transport.bridge ? { ...transport, bridge: recording(transport.bridge) } : transport;
    };
    const runner = agent.createAgentRunner({ model: rt.model, environment: (draft: unknown) => rt.getProvisioningEnvironment(draft), harness });
    const ownership = { mint: () => ({}), check: () => ({ ok: true }) };
    store.getState().newDraft();
    store.getState().mutate((draft: any) => ({ ...draft, title: input.title }));
    let session = agent.newAgentSession(input.goal, input.mode, { maxSteps: input.maxSteps });
    const accepted: unknown[] = [];
    const start = store.getState().draft;
    const apply = (op: unknown) => { accepted.push(op); store.getState().mutate((draft: unknown) => agent.applyDraftOp(draft, op)); };
    let lapsed: string | null = null;
    for (let guard = 0; guard < input.maxSteps * 3; guard += 1) {
      if (session.status === 'awaiting-plan') { session = agent.approvePlan(session, session.plan); continue; }
      if (session.status === 'awaiting-author') {
        const pending = agent.pendingStep(session);
        if (pending.family === 'provision' && input.provision === 'apply') {
          const outcome = await rt.applyProvisioning(pending.op, store.getState().draft);
          if (outcome.ok) store.getState().mutate((draft: unknown) => agent.applyProvisioningFollowUps(draft, pending.op));
          session = agent.resolveProvisioning(session, pending.id, outcome, store.getState().draft);
        } else if (pending.family === 'provision') {
          session = agent.decideStep(session, pending.id, { kind: 'reject', reason: 'measurement run: the author does not create assets here' }, store.getState().draft).session;
        } else {
          const decided = agent.decideStep(session, pending.id, { kind: 'accept' }, store.getState().draft);
          session = decided.session;
          if (decided.apply) apply(decided.apply);
        }
        continue;
      }
      if (session.status !== 'planning' && session.status !== 'running') break;
      const outcome = await agent.driveAgent(session, {
        runner, ownership, draft: () => store.getState().draft, applyOp: apply, commit: (next: any) => { session = next; }, stopRequested: () => false,
      });
      session = outcome.session;
      if (outcome.lapsed) { lapsed = outcome.lapsed; break; }
    }
    const draft = store.getState().draft;
    const replay = accepted.reduce((current, op) => agent.applyDraftOp(current, op), start);
    return { session, draft, lapsed, validationErrors: agent.validationErrorCount(draft), replayMatches: JSON.stringify(replay) === JSON.stringify(draft), bridge };
  }, { input, handles: UI_RUNNER_HANDLES });
}

export function bridgeEvidenceProblems(route: 'local' | 'harness', bridge: BridgeEvidence | null | undefined): string[] {
  if (!bridge) return ['no bridge evidence was recorded'];
  if (route === 'local') {
    if (bridge.transport === 'refusal') return [`the Studio resolver refused the harness route: ${bridge.refusal}`];
    if (bridge.transport !== 'none') return [`--route local, but the authoring role is routed to a harness (${bridge.transport}): the run would not measure the local route`];
    return bridge.events.length ? ['--route local recorded bridge traffic'] : [];
  }
  if (bridge.transport === 'refusal') return [`the Studio resolver refused the harness route: ${bridge.refusal}`];
  if (bridge.transport !== 'bridge') return [`--route harness needs the native tool bridge, the Studio resolver gave ${bridge.transport === 'none' ? 'no harness (route "Wizard and road ahead" to harness:opencode:<model>)' : 'the text protocol'}`];
  const problems: string[] = [];
  const opened = bridge.events.filter((event) => event.op === 'open' && event.ok && event.sessionId);
  if (!opened.length) problems.push('no bridge session opened');
  const calls = bridge.events.filter((event) => event.op === 'next' && event.kind === 'call' && event.tool);
  if (!calls.length) problems.push('no native tool call reached the page');
  const answered = bridge.events.filter((event) => event.op === 'answer' && event.delivered);
  if (!answered.length) problems.push('no tool call was answered back over the bridge');
  for (const call of calls) if (!bridge.events.some((event) => event.op === 'answer' && event.callId === call.callId)) problems.push(`tool call ${call.callId} (${call.tool}) was never answered`);
  for (const session of opened) {
    const ended = bridge.events.some((event) => event.sessionId === session.sessionId && (event.op === 'close' || (event.op === 'next' && (event.kind === 'done' || event.kind === 'ended'))));
    if (!ended) problems.push(`bridge session ${session.sessionId} was never closed`);
  }
  return problems;
}

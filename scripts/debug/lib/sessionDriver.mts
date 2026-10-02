import { mkdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { evaluateInST } from './evaluate.mts';
import {
  backdateSession, flagMoment, MUTATION_VERBS, runGuardedTurn, runMutation, waitSchedulerIdle,
  groupNeedle, type LiveDeps, type LiveOptions, type MutationArgs, type MutationVerb,
} from './sessionLive.mts';
import { runMemoryVerb, type MemoryOp } from './sessionMemory.mts';
import { defaultDeleteDeps, deleteSessionChat, type BookAnswer, type DeleteDeps } from './sessionDelete.mts';

export const LIVE_VERBS = ['turn', ...MUTATION_VERBS, 'flag', 'shot', 'age', 'adopt', 'mem', 'delete-chat', 'goal', 'agent'] as const;
export type LiveVerb = (typeof LIVE_VERBS)[number];
export const AGENT_OPS = ['go', 'continue', 'new-goal', 'state', 'mode'] as const;
export type AgentOp = (typeof AGENT_OPS)[number];
export const GOAL_AGENT_MODES = ['review', 'auto-draft'] as const;

export interface LiveChat { chatId: string; group: string | null; groupId?: string | null; deleted?: boolean }
export interface LiveRequest {
  verb: LiveVerb;
  dir: string;
  chat: LiveChat | null;
  sessionChats?: LiveChat[];
  args: MutationArgs & { note?: string; via?: 'drawer' | 'slash'; label?: string; hours?: number; seq?: number; memOp?: string; ref?: string; book?: BookAnswer | null; agentOp?: AgentOp; agentMode?: string | null; fresh?: boolean; go?: boolean };
  options?: LiveOptions;
  tag?: { arm?: string; gate?: string };
}

export interface AgentState { agent?: boolean; status?: string | null; busy?: boolean; error?: string | null; plan?: string; [key: string]: unknown }
type Timeout = { timeoutMs?: number };
export interface AgentUi {
  agentGoal: (page: any, goal: string, options: { mode: string | null; fresh: boolean } & Timeout) => Promise<AgentState>;
  agentGo: (page: any, options?: Timeout) => Promise<AgentState>;
  agentContinue: (page: any, options?: Timeout) => Promise<AgentState>;
  agentNewGoal: (page: any) => Promise<AgentState>;
  getAgentState: (page: any) => Promise<AgentState>;
  setAgentEntry: (page: any, choice: string) => Promise<AgentState>;
}

const SETTLED = ['awaiting-author', 'done', 'budget', 'stopped'];

export function agentProblems(state: AgentState, expected: readonly string[] | null): string[] {
  if (!state?.agent) return ['the Agent pane is not open'];
  const problems: string[] = [];
  if (state.error) problems.push(`the agent pane shows an error: ${state.error}`);
  if (state.busy) problems.push('the agent is still working');
  if (expected && !expected.includes(String(state.status))) problems.push(`agent status ${String(state.status)}, expected ${expected.join(' or ')}`);
  return problems;
}

export async function runAgentVerb(page: any, request: Pick<LiveRequest, 'verb' | 'args' | 'options'>, ui: AgentUi) {
  const { verb, args } = request;
  const timeout = request.options?.timeoutMs ? { timeoutMs: request.options.timeoutMs } : {};
  const at = new Date().toISOString();
  if (verb === 'goal') {
    const planned = await ui.agentGoal(page, args.text ?? '', { mode: args.agentMode ?? null, fresh: Boolean(args.fresh), ...timeout });
    const approve = Boolean(args.go) && planned.status === 'awaiting-plan';
    const state = approve ? await ui.agentGo(page, timeout) : planned;
    const problems = [
      ...(args.go && !approve ? [`no plan to approve: the agent answered the goal with status ${String(planned.status)}`] : []),
      ...agentProblems(state, args.go ? SETTLED : ['awaiting-plan']),
    ];
    return { kind: 'goal', at, goal: args.text, mode: args.agentMode ?? null, fresh: Boolean(args.fresh), went: approve, planned: { status: planned.status ?? null, plan: planned.plan ?? null }, state, problems, ok: problems.length === 0 };
  }
  const op = args.agentOp;
  const state = op === 'go' ? await ui.agentGo(page, timeout)
    : op === 'continue' ? await ui.agentContinue(page, timeout)
      : op === 'new-goal' ? await ui.agentNewGoal(page)
        : op === 'mode' ? await ui.setAgentEntry(page, String(args.agentMode ?? ''))
          : op === 'state' ? await ui.getAgentState(page)
            : null;
  if (!state) throw new Error(`agent needs one of ${AGENT_OPS.join(', ')}`);
  const problems = op === 'go' || op === 'continue' ? agentProblems(state, SETTLED) : op === 'state' ? [] : agentProblems(state, null).filter((problem) => !(op === 'mode' && args.agentMode === 'step' && problem === 'the Agent pane is not open'));
  return { kind: 'agent', at, op, ...(op === 'mode' ? { mode: args.agentMode } : {}), state, problems, ok: problems.length === 0 };
}

export async function defaultLiveDeps(): Promise<LiveDeps> {
  const [actions, navigation, ready, ui] = await Promise.all([import('../st-actions.mts'), import('../st-navigation.mts'), import('./st-ready.mts'), import('../so-ui.mts')]);
  const settle = (page: any) => navigation.waitForSettledChat(page, { quietMs: 1500, timeoutMs: 60000 });
  return {
    send: (page, line, options) => actions.sendUserMessage(page, line, options as any),
    waitIdle: (page, timeoutMs) => actions.waitForIdle(page, timeoutMs),
    waitScheduler: (page, timeoutMs, quietMs) => waitSchedulerIdle(page, timeoutMs, quietMs),
    startSend: async (page, line) => {
      await actions.waitForIdle(page, 600000);
      const textarea = page.locator('#send_textarea');
      await textarea.fill(line);
      await textarea.dispatchEvent('input');
      const send = page.locator('#send_but');
      await send.waitFor({ state: 'visible', timeout: 60000 });
      await send.click({ force: true });
    },
    waitGenerating: async (page, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if ((await actions.getGenerationState(page)).isGenerating) return true;
        await page.waitForTimeout(100);
      }
      return false;
    },
    clickSwipeRight: (page, selector) => page.locator(selector).first().click({ force: true, timeout: 15000 }),
    closeOverlays: async (page) => {
      await navigation.closeUnpinnedDrawers(page);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const open = await evaluateInST(page, () => document.querySelectorAll('dialog[open]').length);
        if (!open) break;
        const ours = page.locator('dialog[open]:has(.so-popup-anchor) .popup-button-ok').first();
        if (await ours.count()) await ours.click({ force: true, timeout: 5000 });
        else await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(300);
    },
    hitTest: (page, selector) => ui.hitTest(page, selector),
    flag: (page, note) => flagMoment(page, note),
    revealMessage: async (page, selector) => {
      const revealed = await evaluateInST(page, (target: string) => {
        const chat = document.getElementById('chat');
        if (chat) chat.scrollTop = chat.scrollHeight;
        const element = document.querySelector(target) as HTMLElement | null;
        const message = element?.closest('.mes') as HTMLElement | null;
        const inside = () => {
          if (!element || !chat) return false;
          const box = element.getBoundingClientRect();
          const frame = chat.getBoundingClientRect();
          return box.top >= frame.top && box.bottom <= frame.bottom;
        };
        if (message && !inside()) message.scrollIntoView({ block: 'end' });
        return { found: Boolean(element), scrolledToBottom: Boolean(chat) && Math.abs(chat!.scrollHeight - chat!.clientHeight - chat!.scrollTop) <= 2, inView: inside() };
      }, selector);
      await page.waitForTimeout(250);
      return revealed;
    },
    openChat: async (page, target) => {
      const needle = groupNeedle(target);
      if (needle) {
        await page.waitForFunction((wanted: string) => ((globalThis as any).SillyTavern?.getContext?.().groups ?? []).some((group: any) => group?.id === wanted || group?.name === wanted), needle, { timeout: 60000 });
        await navigation.openGroup(page, needle);
      }
      await settle(page);
      await navigation.openChat(page, target.chatId);
      await settle(page);
    },
    reload: async (page) => {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
      await ready.ensureSTReady(page, { timeout: 120000 });
      await page.waitForFunction(() => Boolean((globalThis as any).storyOrchestratorRuntime), null, { timeout: 120000 });
      await page.waitForTimeout(1500);
    },
    lineSaved: (page, chatId, line) => evaluateInST(page, async ({ chatId, line }: { chatId: string; line: string }) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const character = ctx.groupId ? null : (ctx.characters ?? [])[Number(ctx.characterId)];
      const [url, body] = ctx.groupId ? ['/api/chats/group/get', { id: chatId }] : ['/api/chats/get', { ch_name: character?.name, file_name: chatId, avatar_url: character?.avatar }];
      const response = await fetch(url, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
      const rows = response.ok ? await response.json().catch(() => null) : null;
      return Array.isArray(rows) && rows.some((row: any) => Boolean(row?.is_user) && String(row?.mes ?? '').trim() === line.trim());
    }, { chatId, line }),
    now: () => Date.now(),
  };
}

const openChatId = (page: any) => evaluateInST(page, () => (globalThis as any).SillyTavern.getContext().chatId ?? null);

export async function ensureChat(page: any, chat: LiveChat | null, deps: Pick<LiveDeps, 'openChat'>) {
  if (!chat) return { chatId: await openChatId(page), reopened: false };
  const open = await openChatId(page);
  if (open === chat.chatId) return { chatId: open, reopened: false };
  await deps.openChat(page, chat);
  const after = await openChatId(page);
  if (after !== chat.chatId) throw new Error(`the session chat ${chat.chatId} is not open and could not be reopened (open: ${String(after)})`);
  return { chatId: after, reopened: true, from: open };
}

export async function openSessionChat(page: any, chats: LiveChat[]): Promise<LiveChat> {
  const open = await openChatId(page);
  const live = chats.filter((chat) => chat.deleted !== true);
  const found = live.find((chat) => chat.chatId === open);
  if (!found) throw new Error(`the open chat ${open ?? '(none)'} is not one of this session's chats (${live.map((chat) => chat.chatId).join(', ') || 'none'}): open one of them, or name it with --chat <id>`);
  return found;
}

export const shotName = (seq: number, label: string) => `${String(seq).padStart(3, '0')}-${label.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'shot'}.png`;

export async function runLive(page: any, request: LiveRequest, deps: LiveDeps, deleteDeps?: DeleteDeps, agentUi?: AgentUi) {
  const { verb, args } = request;
  if (verb === 'goal' || verb === 'agent') return runAgentVerb(page, request, agentUi ?? await import('../so-ui.mts') as unknown as AgentUi);
  if (verb === 'adopt') {
    const read = await evaluateInST(page, () => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const group = (ctx.groups ?? []).find((candidate: any) => candidate.id === ctx.groupId);
      const snapshot = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.() ?? {};
      return { chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, group: group?.name ?? null, storyId: snapshot.storyId ?? null, activeCheckpointId: snapshot.activeCheckpointId ?? null };
    });
    if (!read.chatId) throw new Error('no chat is open to adopt');
    return { kind: 'adopt', at: new Date().toISOString(), ok: true, chat: read };
  }
  const target = request.chat ?? (request.sessionChats ? await openSessionChat(page, request.sessionChats) : null);
  const ensured = await ensureChat(page, target, deps);
  if (verb === 'delete-chat') {
    if (!target) throw new Error('delete-chat needs the session chat to delete');
    return { ...(await deleteSessionChat(page, { dir: request.dir, chat: target, book: args.book ?? null }, deleteDeps ?? await defaultDeleteDeps())), ensured };
  }
  if (verb === 'turn') {
    if (!args.line) throw new Error('turn needs the player line');
    return { ...(await runGuardedTurn(page, args.line, deps, request.options ?? {})), ensured };
  }
  if ((MUTATION_VERBS as readonly string[]).includes(verb)) {
    return { ...(await runMutation(page, verb as MutationVerb, { ...args, chatId: target?.chatId ?? args.chatId, group: target?.group ?? args.group ?? null, groupId: target?.groupId ?? args.groupId ?? null }, deps, request.options ?? {})), ensured };
  }
  if (verb === 'flag') {
    if (!args.note) throw new Error('flag needs a note (a word or two)');
    return { ...(await flagMoment(page, args.note, { via: args.via ?? 'drawer' })), ensured };
  }
  if (verb === 'shot') {
    const label = args.label ?? 'shot';
    const name = shotName(args.seq ?? 0, label);
    const path = resolve(request.dir, 'shots', name);
    await mkdir(resolve(request.dir, 'shots'), { recursive: true });
    await page.screenshot({ path, fullPage: false });
    return { kind: 'shot', at: new Date().toISOString(), ok: true, label, path: relative(request.dir, path).replace(/\\/g, '/'), chatId: ensured.chatId };
  }
  if (verb === 'mem') return { ...(await runMemoryVerb(page, args.memOp as MemoryOp, args.ref ?? '', args.text)), ensured };
  if (verb === 'age') {
    const aged = await backdateSession(page, Number(args.hours), deps, target);
    return { kind: 'age', at: new Date().toISOString(), ...aged, ok: aged.ok === true && aged.fired === true, ensured };
  }
  throw new Error(`unknown live verb ${String(verb)}`);
}

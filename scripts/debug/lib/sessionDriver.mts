import { mkdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { evaluateInST } from './evaluate.mts';
import {
  backdateSession, flagMoment, MUTATION_VERBS, runMutation, runTurn, waitSchedulerIdle,
  type LiveDeps, type LiveOptions, type MutationArgs, type MutationVerb,
} from './sessionLive.mts';

export const LIVE_VERBS = ['turn', ...MUTATION_VERBS, 'flag', 'shot', 'age', 'adopt'] as const;
export type LiveVerb = (typeof LIVE_VERBS)[number];

export interface LiveChat { chatId: string; group: string | null }
export interface LiveRequest {
  verb: LiveVerb;
  dir: string;
  chat: LiveChat | null;
  args: MutationArgs & { note?: string; via?: 'drawer' | 'slash'; label?: string; hours?: number; seq?: number };
  options?: LiveOptions;
  tag?: { arm?: string; gate?: string };
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
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(300);
    },
    hitTest: (page, selector) => ui.hitTest(page, selector),
    openChat: async (page, target) => {
      if (target.group) await navigation.openGroup(page, target.group);
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

export const shotName = (seq: number, label: string) => `${String(seq).padStart(3, '0')}-${label.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'shot'}.png`;

export async function runLive(page: any, request: LiveRequest, deps: LiveDeps) {
  const { verb, args } = request;
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
  const ensured = await ensureChat(page, request.chat, deps);
  if (verb === 'turn') {
    if (!args.line) throw new Error('turn needs the player line');
    return { ...(await runTurn(page, args.line, deps, request.options ?? {})), ensured };
  }
  if ((MUTATION_VERBS as readonly string[]).includes(verb)) {
    return { ...(await runMutation(page, verb as MutationVerb, { ...args, chatId: request.chat?.chatId ?? args.chatId, group: request.chat?.group ?? args.group ?? null }, deps, request.options ?? {})), ensured };
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
  if (verb === 'age') {
    const aged = await backdateSession(page, Number(args.hours));
    return { kind: 'age', at: new Date().toISOString(), ...aged, ok: aged.ok === true && aged.fired === true, ensured };
  }
  throw new Error(`unknown live verb ${String(verb)}`);
}

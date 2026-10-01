import { evaluateInST } from './evaluate.mts';
import { modelDefects, type ModelDefect } from './modelDefects.mts';

export interface LiveMessage { id: number; name: string; isUser: boolean; isSystem: boolean; text: string; swipeId: number | null; swipes: number }
export interface LiveJournalEvent { at: string; boundary: number; messageId: number; kind: string; summary: string; detail?: Record<string, unknown> }
export interface LiveRead {
  at: string;
  chatId: string | null;
  groupId: string | null;
  chatLength: number;
  messages: LiveMessage[];
  storyId: string | null;
  activeCheckpointId: string | null;
  activeCheckpointName: string | null;
  boundary: number | null;
  blackboard: Record<string, unknown>;
  pipeline: { state: string | null; text: string | null; detail: string | null } | null;
  lastRollback: unknown;
  rollbackUnavailable: unknown;
  scheduler: unknown;
  journal: LiveJournalEvent[];
}
export interface RecorderEvent { index: number; at: string; event: string; type?: string | null; dryRun?: boolean; chid?: number | null; name?: string | null; messageId?: number | null; chatId?: string | null }

export const RECORDER_KEY = '__soSessionRecorder';
export const RECORDER_CAP = 500;
export const ROLLBACK_KINDS = /rollback|rolled back|stepped back|rewind|quarantin|discard/i;

export async function readLive(page: any, from: number | null = null): Promise<LiveRead> {
  return evaluateInST(page, (start: number | null) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const snapshot = rt?.getSnapshot?.() ?? {};
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const first = start === null ? chat.length : Math.max(0, start);
    const pipeline = snapshot.pipeline ?? null;
    return {
      at: new Date().toISOString(),
      chatId: ctx.chatId ?? null,
      groupId: ctx.groupId ?? null,
      chatLength: chat.length,
      messages: chat.slice(first).map((message: any, offset: number) => ({
        id: first + offset,
        name: String(message?.name ?? ''),
        isUser: Boolean(message?.is_user),
        isSystem: Boolean(message?.is_system),
        text: String(message?.mes ?? ''),
        swipeId: Number.isInteger(message?.swipe_id) ? message.swipe_id : null,
        swipes: Array.isArray(message?.swipes) ? message.swipes.length : 0,
      })),
      storyId: snapshot.storyId ?? null,
      activeCheckpointId: snapshot.activeCheckpointId ?? null,
      activeCheckpointName: snapshot.activeCheckpointName ?? null,
      boundary: typeof snapshot.boundary === 'number' ? snapshot.boundary : null,
      blackboard: snapshot.blackboard ?? {},
      pipeline: pipeline ? { state: pipeline.state ?? null, text: pipeline.text ?? null, detail: pipeline.detail ?? null } : null,
      lastRollback: snapshot.lastRollback ?? null,
      rollbackUnavailable: snapshot.rollbackUnavailable ?? null,
      scheduler: snapshot.extraction?.scheduler ?? null,
      journal: (rt?.getSessionJournal?.() ?? []).map((event: any) => ({ at: event.at, boundary: event.boundary, messageId: event.messageId, kind: event.kind, summary: event.summary, ...(event.detail ? { detail: event.detail } : {}) })),
    };
  }, from);
}

export async function armTurnRecorder(page: any): Promise<{ cursor: number; alreadyArmed: boolean }> {
  return evaluateInST(page, ({ key, cap }: { key: string; cap: number }) => {
    const root = globalThis as any;
    const state = root[key] ||= { armed: false, events: [], nextIndex: 0 };
    if (state.armed) return { cursor: state.nextIndex, alreadyArmed: true };
    const ctx = root.SillyTavern.getContext();
    const push = (row: Record<string, unknown>) => {
      state.events.push({ index: state.nextIndex++, at: new Date().toISOString(), ...row });
      state.events = state.events.slice(-cap);
    };
    const nameOf = (chid: unknown) => {
      const character = (ctx.characters ?? [])[Number(chid)];
      return character?.name ?? null;
    };
    const on = (key: string, handler: (...args: any[]) => void) => {
      const type = ctx.eventTypes?.[key];
      if (type) ctx.eventSource.on(type, handler);
    };
    on('GENERATION_STARTED', (type: unknown, _options: unknown, dryRun: unknown) => push({ event: 'generation_started', type: type ?? null, dryRun: dryRun === true }));
    on('GENERATION_ENDED', () => push({ event: 'generation_ended' }));
    on('GROUP_MEMBER_DRAFTED', (chid: unknown) => push({ event: 'drafted', chid: Number(chid), name: nameOf(chid) }));
    on('GROUP_WRAPPER_STARTED', () => push({ event: 'group_wrapper_started' }));
    on('GROUP_WRAPPER_FINISHED', () => push({ event: 'group_wrapper_finished' }));
    on('MESSAGE_RECEIVED', (messageId: unknown, type: unknown) => push({ event: 'message_received', messageId: Number(messageId), type: type ?? null }));
    on('MESSAGE_SWIPED', (messageId: unknown) => push({ event: 'message_swiped', messageId: Number(messageId) }));
    on('MESSAGE_EDITED', (messageId: unknown) => push({ event: 'message_edited', messageId: Number(messageId) }));
    on('MESSAGE_DELETED', (messageId: unknown) => push({ event: 'message_deleted', messageId: Number(messageId) }));
    on('CHAT_CHANGED', (chatId: unknown) => push({ event: 'chat_changed', chatId: chatId === undefined || chatId === null ? null : String(chatId) }));
    state.armed = true;
    return { cursor: state.nextIndex, alreadyArmed: false };
  }, { key: RECORDER_KEY, cap: RECORDER_CAP });
}

export async function readRecorder(page: any, since: number): Promise<{ armed: boolean; events: RecorderEvent[] }> {
  return evaluateInST(page, ({ key, since }: { key: string; since: number }) => {
    const state = (globalThis as any)[key];
    if (!state?.armed) return { armed: false, events: [] };
    return { armed: true, events: state.events.filter((event: any) => event.index >= since) };
  }, { key: RECORDER_KEY, since });
}

export function blackboardDiff(before: Record<string, unknown> = {}, after: Record<string, unknown> = {}) {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const from = before?.[key];
    const to = after?.[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changed[key] = { from: from ?? null, to: to ?? null };
  }
  return { count: Object.keys(changed).length, changed };
}

const eventKey = (event: LiveJournalEvent) => `${event.at}|${event.kind}|${event.boundary}|${event.messageId}|${event.summary}`;

export function newJournalEvents(before: LiveJournalEvent[] = [], after: LiveJournalEvent[] = []): LiveJournalEvent[] {
  const seen = new Map<string, number>();
  for (const event of before) seen.set(eventKey(event), (seen.get(eventKey(event)) ?? 0) + 1);
  return after.filter((event) => {
    const key = eventKey(event);
    const left = seen.get(key) ?? 0;
    if (left > 0) { seen.set(key, left - 1); return false; }
    return true;
  });
}

export function generationsOf(events: RecorderEvent[] = []) {
  const loud = events.filter((event) => event.event === 'generation_started' && !event.dryRun && event.type !== 'quiet');
  return {
    count: loud.length,
    types: loud.map((event) => event.type ?? 'normal'),
    quiet: events.filter((event) => event.event === 'generation_started' && event.type === 'quiet').length,
    dryRuns: events.filter((event) => event.event === 'generation_started' && event.dryRun).length,
    drafted: events.filter((event) => event.event === 'drafted').map((event) => event.name ?? String(event.chid)),
    received: events.filter((event) => event.event === 'message_received').map((event) => ({ messageId: event.messageId ?? null, type: event.type ?? null })),
  };
}

const checkpointOf = (read: LiveRead) => ({ id: read.activeCheckpointId, name: read.activeCheckpointName });

function rollbackOf(before: LiveRead, after: LiveRead, journal: LiveJournalEvent[]) {
  const noticeChanged = JSON.stringify(before.lastRollback) !== JSON.stringify(after.lastRollback) && after.lastRollback !== null;
  const boundaryBack = before.boundary !== null && after.boundary !== null && after.boundary < before.boundary;
  const events = journal.filter((event) => ROLLBACK_KINDS.test(`${event.kind} ${event.summary}`));
  return {
    happened: noticeChanged || boundaryBack || events.length > 0,
    notice: after.lastRollback,
    unavailable: after.rollbackUnavailable,
    boundary: { from: before.boundary, to: after.boundary },
    checkpoint: { from: checkpointOf(before), to: checkpointOf(after) },
    events,
  };
}

export interface Timing { startedAt: number; actedAt: number; settledAt: number; endedAt: number }

const timingOf = (timing: Timing) => ({ actMs: timing.actedAt - timing.startedAt, settleMs: timing.settledAt - timing.actedAt, totalMs: timing.endedAt - timing.startedAt });

export function composeTurn({ line, before, after, recorder, send, timing, schedulerError = null, expectReply = true }: {
  line: string; before: LiveRead; after: LiveRead; recorder: RecorderEvent[]; send: any; timing: Timing; schedulerError?: string | null; expectReply?: boolean;
}) {
  const journal = newJournalEvents(before.journal, after.journal);
  const replies = after.messages.filter((message) => !message.isUser && !message.isSystem && message.text.trim().length > 0);
  const notes = after.messages.filter((message) => message.isSystem);
  const generations = generationsOf(recorder);
  const replied = replies.length > 0;
  const problems = [
    ...(expectReply && !replied ? ['no reply: the send produced no non-empty character message (backend down, or silence under talk control)'] : []),
    ...(after.chatId !== before.chatId ? [`the open chat changed during the turn (${before.chatId} -> ${after.chatId})`] : []),
    ...(schedulerError ? [`scheduler did not settle: ${schedulerError}`] : []),
    ...(send?.round?.settled === false ? [`the round did not settle: a group round or generation was still open after ${send.round.waitedMs} ms`] : []),
  ];
  return {
    kind: 'turn' as const,
    at: before.at,
    chatId: before.chatId,
    line,
    ok: problems.length === 0,
    problems,
    replied,
    replies: replies.map((message) => ({ messageId: message.id, speaker: message.name, text: message.text })),
    speakers: [...new Set(replies.map((message) => message.name))],
    notes: notes.map((message) => ({ messageId: message.id, name: message.name, text: message.text })),
    generations,
    multiGeneration: generations.count > 1 || replies.length > 1,
    checkpoint: { before: checkpointOf(before), after: checkpointOf(after), changed: before.activeCheckpointId !== after.activeCheckpointId },
    boundary: { from: before.boundary, to: after.boundary },
    blackboard: blackboardDiff(before.blackboard, after.blackboard),
    journal,
    rollback: rollbackOf(before, after, journal),
    pipeline: after.pipeline,
    scheduler: after.scheduler,
    send: send ?? null,
    timing: timingOf(timing),
  };
}

export function composeMutation({ verb, args, before, after, recorder, did, timing, problems = [] }: {
  verb: string; args: Record<string, unknown>; before: LiveRead; after: LiveRead; recorder: RecorderEvent[]; did: Record<string, unknown>; timing: Timing; problems?: string[];
}) {
  const journal = newJournalEvents(before.journal, after.journal);
  return {
    kind: 'mutation' as const,
    verb,
    at: before.at,
    chatId: before.chatId,
    args,
    ok: problems.length === 0,
    problems,
    did,
    chat: { lengthBefore: before.chatLength, lengthAfter: after.chatLength, chatAfter: after.chatId },
    tail: after.messages.map((message) => ({ messageId: message.id, speaker: message.name, isUser: message.isUser, text: message.text, swipeId: message.swipeId, swipes: message.swipes })),
    generations: generationsOf(recorder),
    hostEvents: recorder.map(({ index: _index, ...event }) => event),
    checkpoint: { before: checkpointOf(before), after: checkpointOf(after), changed: before.activeCheckpointId !== after.activeCheckpointId },
    blackboard: blackboardDiff(before.blackboard, after.blackboard),
    rollback: rollbackOf(before, after, journal),
    journal,
    pipeline: after.pipeline,
    timing: timingOf(timing),
  };
}

export async function waitSchedulerIdle(page: any, timeoutMs = 600000, quietMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let quietSince: number | null = null;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await evaluateInST(page, () => (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.().extraction?.scheduler ?? null);
    const busy = !last || last.inFlight || last.queueDepth > 0 || last.heavyInFlight || (last.heavyQueueDepth ?? 0) > 0;
    if (busy) quietSince = null;
    else if (quietSince === null) quietSince = Date.now();
    if (!busy && quietSince !== null && Date.now() - quietSince >= quietMs) return { scheduler: last, quietMs };
    await page.waitForTimeout(250);
  }
  throw new Error(`the extraction scheduler did not drain within ${timeoutMs} ms: ${JSON.stringify(last)}`);
}

export interface LiveDeps {
  send: (page: any, line: string, options: Record<string, unknown>) => Promise<any>;
  waitIdle: (page: any, timeoutMs: number) => Promise<unknown>;
  waitScheduler: (page: any, timeoutMs: number, quietMs: number) => Promise<unknown>;
  startSend: (page: any, line: string) => Promise<unknown>;
  waitGenerating: (page: any, timeoutMs: number) => Promise<boolean>;
  clickSwipeRight: (page: any, selector: string) => Promise<unknown>;
  closeOverlays: (page: any) => Promise<unknown>;
  hitTest: (page: any, selector: string) => Promise<HitTest>;
  revealMessage: (page: any, selector: string) => Promise<Reveal>;
  flag: (page: any, note: string) => Promise<Record<string, unknown> & { ok?: boolean }>;
  openChat: (page: any, target: ChatTarget) => Promise<unknown>;
  reload: (page: any) => Promise<unknown>;
  now: () => number;
}

export interface HitTest { selector: string; found: boolean; clickable: boolean; blocked?: string; reason?: string; topmost?: string }

export interface Reveal { found: boolean; scrolledToBottom: boolean; inView: boolean }

export interface LiveOptions { timeoutMs?: number; quietMs?: number; roundQuietMs?: number; expectReply?: boolean; loopGuard?: boolean }

async function settle(page: any, deps: LiveDeps, options: LiveOptions) {
  try {
    await deps.waitScheduler(page, options.timeoutMs ?? 600000, options.quietMs ?? 3000);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export const ROUND_QUIET_MS = 4000;
const ROUND_ACTIVITY = new Set(['generation_started', 'drafted', 'message_received', 'group_wrapper_started', 'group_wrapper_finished']);

export function roundOpen(events: RecorderEvent[]) {
  const started = events.filter((event) => event.event === 'group_wrapper_started').length;
  const finished = events.filter((event) => event.event === 'group_wrapper_finished').length;
  return started > finished;
}

const pageGenerating = (page: any) => evaluateInST(page, () => {
  const doc = (globalThis as any).document;
  return Boolean(doc?.body?.dataset?.generating);
});

const talkChainPending = (page: any) => evaluateInST(page, () => (globalThis as any).storyOrchestratorTalk?.chainPending?.() === true);

export async function waitRoundSettled(page: any, deps: Pick<LiveDeps, 'waitIdle' | 'now'>, cursor: number, { quietMs = ROUND_QUIET_MS, timeoutMs = 600000 }: { quietMs?: number; timeoutMs?: number } = {}) {
  const startedAt = deps.now();
  let seen = -1;
  let lastActivity = startedAt;
  let polls = 0;
  while (deps.now() - startedAt < timeoutMs) {
    const events = (await readRecorder(page, cursor)).events;
    const activity = events.filter((event) => ROUND_ACTIVITY.has(event.event)).length;
    if (activity !== seen) { seen = activity; lastActivity = deps.now(); }
    const open = roundOpen(events) || await pageGenerating(page) || await talkChainPending(page);
    if (open) lastActivity = deps.now();
    else if (deps.now() - lastActivity >= quietMs) return { settled: true, polls, open: false, waitedMs: deps.now() - startedAt };
    polls += 1;
    await page.waitForTimeout(250);
    if (open) await deps.waitIdle(page, timeoutMs);
  }
  return { settled: false, polls, open: true, waitedMs: deps.now() - startedAt };
}

export async function runTurn(page: any, line: string, deps: LiveDeps, options: LiveOptions = {}) {
  const startedAt = deps.now();
  const { cursor } = await armTurnRecorder(page);
  const before = await readLive(page);
  const sent = await deps.send(page, line, { idleTimeoutMs: options.timeoutMs ?? 600000, expectReply: options.expectReply !== false });
  const round = await waitRoundSettled(page, deps, cursor, { quietMs: options.roundQuietMs ?? ROUND_QUIET_MS, timeoutMs: options.timeoutMs ?? 600000 });
  const send = { ...sent, round };
  const actedAt = deps.now();
  const schedulerError = await settle(page, deps, options);
  const settledAt = deps.now();
  const after = await readLive(page, before.chatLength);
  const recorder = (await readRecorder(page, cursor)).events;
  return composeTurn({ line, before, after, recorder, send, timing: { startedAt, actedAt, settledAt, endedAt: deps.now() }, schedulerError, expectReply: options.expectReply !== false });
}

export const MUTATION_VERBS = ['swipe-new', 'regen', 'edit', 'delete', 'switch-chat-mid-gen', 'reload-mid-gen'] as const;
export type MutationVerb = (typeof MUTATION_VERBS)[number];

export interface MutationArgs { messageId?: number | 'last'; text?: string; line?: string; to?: string | null; toGroup?: string | null; toGroupId?: string | null; chatId?: string; group?: string | null; groupId?: string | null }

export interface ChatTarget { chatId: string; group: string | null; groupId?: string | null }

export const groupNeedle = (target: { group?: string | null; groupId?: string | null }): string | null => target.groupId || target.group || null;

export interface ReplyTarget { id: number | null; isUser: boolean; swipeId: number; swipes: number; name: string; length: number; notesAfter: Array<{ messageId: number; name: string; text: string }> }

const replyTarget = (page: any): Promise<ReplyTarget> => evaluateInST(page, () => {
  const chat = (globalThis as any).SillyTavern.getContext().chat ?? [];
  const isNote = (message: any) => Boolean(message?.is_system) || message?.extra?.type === 'comment' || Boolean(message?.extra?.isSmallSys);
  const notesAfter: Array<{ messageId: number; name: string; text: string }> = [];
  let id = chat.length - 1;
  while (id >= 0 && isNote(chat[id])) {
    notesAfter.unshift({ messageId: id, name: String(chat[id].name ?? ''), text: String(chat[id].mes ?? '').slice(0, 200) });
    id -= 1;
  }
  const message = id >= 0 ? chat[id] : null;
  if (!message) return { id: null, isUser: false, swipeId: 0, swipes: 0, name: '', length: chat.length, notesAfter };
  return { id, isUser: Boolean(message.is_user), swipeId: Number(message.swipe_id ?? 0), swipes: Array.isArray(message.swipes) ? message.swipes.length : 1, name: String(message.name ?? ''), length: chat.length, notesAfter };
});

const messageText = (page: any, id: number | null) => evaluateInST(page, (at: number | null) => String(((globalThis as any).SillyTavern.getContext().chat ?? [])[at ?? -1]?.mes ?? ''), id);

const messageAt = (page: any, id: number) => evaluateInST(page, (at: number) => {
  const chat = (globalThis as any).SillyTavern.getContext().chat ?? [];
  const message = chat[at];
  return message ? { id: at, isUser: Boolean(message.is_user), swipeId: Number(message.swipe_id ?? 0), swipes: Array.isArray(message.swipes) ? message.swipes.length : 1, name: String(message.name ?? ''), last: at === chat.length - 1 } : null;
}, id);

async function removeTrailingNotes(page: any, notes: ReplyTarget['notesAfter']) {
  if (!notes.length) return [];
  return evaluateInST(page, async (ids: number[]) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const isNote = (message: any) => Boolean(message?.is_system) || message?.extra?.type === 'comment' || Boolean(message?.extra?.isSmallSys);
    const removed: Array<{ messageId: number; name: string; text: string }> = [];
    for (const id of [...ids].sort((a, b) => b - a)) {
      const message = ctx.chat?.[id];
      if (id !== ctx.chat.length - 1 || !isNote(message)) throw new Error(`message ${id} is no longer a trailing note: refusing to delete it`);
      removed.push({ messageId: id, name: String(message.name ?? ''), text: String(message.mes ?? '').slice(0, 200) });
      await ctx.deleteMessage(id);
    }
    return removed;
  }, notes.map((note) => note.messageId));
}

const overlayState = (page: any) => evaluateInST(page, () => {
  const doc = (globalThis as any).document;
  if (!doc) return { drawerOpen: false, popups: 0 };
  return { drawerOpen: doc.getElementById?.('drawer-manager')?.classList.contains('openDrawer') ?? false, popups: doc.querySelectorAll?.('dialog[open]')?.length ?? 0 };
});

export async function clearOverlays(page: any, deps: Pick<LiveDeps, 'closeOverlays'>) {
  const before = await overlayState(page);
  if (before.drawerOpen || before.popups > 0) await deps.closeOverlays(page);
  const after = await overlayState(page);
  return { before, after, ok: !after.drawerOpen && after.popups === 0 };
}

export async function waitHittable(page: any, deps: Pick<LiveDeps, 'hitTest'>, selector: string, attempts = 8) {
  let hit = await deps.hitTest(page, selector);
  for (let attempt = 1; attempt < attempts && !hit.clickable; attempt += 1) {
    await page.waitForTimeout(250);
    hit = await deps.hitTest(page, selector);
  }
  return hit;
}

const overlayProblems = (overlays: Awaited<ReturnType<typeof clearOverlays>>) => (overlays.ok ? [] : [`could not clear the page before acting (drawer open ${overlays.after.drawerOpen}, popups ${overlays.after.popups})`]);

const targetRecord = (target: ReplyTarget, notesRemoved: unknown[]) => ({ messageId: target.id, speaker: target.name, isUser: target.isUser, skippedNotes: target.notesAfter.length, rule: 'last character reply; system/comment notes after it are skipped', notesRemoved });

export const swipeArrow = (messageId: number) => `#chat .mes[mesid="${messageId}"] .swipe_right`;

async function swipeNew(page: any, deps: LiveDeps, options: LiveOptions) {
  const target = await replyTarget(page);
  if (target.id === null) throw new Error('the chat has no character reply to swipe');
  if (target.isUser) throw new Error('the last message is the player\'s own (notes aside): a new swipe needs a character reply last');
  const overlays = await clearOverlays(page, deps);
  const notesRemoved = await removeTrailingNotes(page, target.notesAfter);
  if (target.swipeId < target.swipes - 1) {
    await evaluateInST(page, async ({ id, last }: { id: number; last: number }) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      await ctx.swipe.to(null, 'right', { source: 'swipe_picker', forceMesId: id, forceSwipeId: last, forceDuration: 0 });
    }, { id: target.id, last: target.swipes - 1 });
  }
  const selector = swipeArrow(target.id);
  const revealed = await deps.revealMessage(page, selector);
  let hit = await waitHittable(page, deps, selector);
  if (!hit.clickable) {
    await deps.revealMessage(page, selector);
    hit = await waitHittable(page, deps, selector);
  }
  const base = { messageId: target.id, speaker: target.name, target: targetRecord(target, notesRemoved), overlays, revealed, hit, swipesBefore: target.swipes, swipeIdBefore: target.swipeId };
  if (!hit.clickable) return { did: { ...base, swipesAfter: target.swipes, swipeIdAfter: null, generated: false, clicked: false }, problems: [...overlayProblems(overlays), `the swipe arrow on message ${target.id} is not hit-testable (${hit.blocked ?? 'blocked'}: ${hit.reason ?? 'unknown'}); nothing was clicked`] };
  await deps.clickSwipeRight(page, selector);
  await deps.waitIdle(page, options.timeoutMs ?? 600000);
  const after = await messageAt(page, target.id);
  const generated = Boolean(after && !after.isUser && (after.swipes > target.swipes || after.swipeId >= target.swipes));
  return {
    did: { ...base, swipesAfter: after?.swipes ?? null, swipeIdAfter: after?.swipeId ?? null, generated, clicked: true, stillLast: after?.last ?? null },
    problems: generated ? [] : [`no new swipe was generated on message ${target.id}`],
  };
}

async function regen(page: any, deps: LiveDeps, options: LiveOptions) {
  const target = await replyTarget(page);
  const overlays = await clearOverlays(page, deps);
  const notesRemoved = await removeTrailingNotes(page, target.notesAfter);
  const result = await evaluateInST(page, async () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    try {
      await ctx.executeSlashCommandsWithOptions('/regenerate await=true');
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });
  await deps.waitIdle(page, options.timeoutMs ?? 600000);
  const after = target.id === null ? null : await messageAt(page, target.id);
  const lastBefore = target.id === null ? null : { id: target.id, isUser: target.isUser, swipeId: target.swipeId, swipes: target.swipes, name: target.name };
  return {
    did: { command: '/regenerate await=true', target: targetRecord(target, notesRemoved), overlays, lastBefore, lastAfter: after, ...result },
    problems: [...overlayProblems(overlays), ...(result.ok ? [] : [`/regenerate failed: ${result.error}`])],
  };
}

async function editLine(page: any, args: MutationArgs, deps: LiveDeps) {
  if (!args.text) throw new Error('edit needs the new text');
  const overlays = await clearOverlays(page, deps);
  const did = await evaluateInST(page, async ({ rawId, text }: { rawId: number | 'last'; text: string }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const id = rawId === 'last' ? (ctx.chat?.length ?? 0) - 1 : Number(rawId);
    const message = ctx.chat?.[id];
    if (!Number.isInteger(id) || !message) throw new Error(`message ${rawId} not found`);
    const before = message.mes;
    message.mes = text;
    if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id)) message.swipes[message.swipe_id] = text;
    await ctx.updateMessageBlock?.(id, message);
    await ctx.saveChat?.();
    await ctx.eventSource.emit(ctx.eventTypes.MESSAGE_EDITED, id);
    return { messageId: id, isUser: Boolean(message.is_user), speaker: String(message.name ?? ''), before, after: text };
  }, { rawId: args.messageId ?? 'last', text: args.text });
  return { did: { ...did, overlays }, problems: overlayProblems(overlays) };
}

async function deleteOne(page: any, args: MutationArgs, deps: LiveDeps) {
  const overlays = await clearOverlays(page, deps);
  const wanted = args.messageId ?? 'last';
  const target = wanted === 'last' ? await replyTarget(page) : null;
  if (target && target.id === null) throw new Error('the chat has no message to delete (notes aside)');
  const id = target ? target.id as number : Number(wanted);
  const did = await evaluateInST(page, async (at: number) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const message = ctx.chat?.[at];
    if (!Number.isInteger(at) || !message) throw new Error(`message ${at} not found`);
    const isNote = Boolean(message.is_system) || message.extra?.type === 'comment' || Boolean(message.extra?.isSmallSys);
    const removed = { messageId: at, speaker: String(message.name ?? ''), isUser: Boolean(message.is_user), isNote, text: String(message.mes ?? '') };
    const lengthBefore = ctx.chat.length;
    await ctx.deleteMessage(at);
    return { ...removed, lengthBefore, lengthAfter: ctx.chat.length };
  }, id);
  const resolved = target ? { requested: 'last', ...targetRecord(target, []), rule: 'last message that is not a system/comment note' } : { requested: id };
  return {
    did: { ...did, target: resolved, overlays },
    problems: [...overlayProblems(overlays), ...(did.lengthAfter === did.lengthBefore - 1 ? [] : [`expected one message removed, chat went ${did.lengthBefore} -> ${did.lengthAfter}`])],
  };
}

async function chatProbe(page: any) {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const chat = ctx.chat ?? [];
    const last = chat[chat.length - 1];
    return { chatId: ctx.chatId ?? null, length: chat.length, last: last ? { name: String(last.name ?? ''), isUser: Boolean(last.is_user), text: String(last.mes ?? '').slice(0, 400) } : null };
  });
}

async function switchMidGen(page: any, args: MutationArgs, deps: LiveDeps, options: LiveOptions) {
  if (!args.line) throw new Error('switch-chat-mid-gen needs a player line to start the generation');
  if (!args.to) throw new Error('switch-chat-mid-gen needs a chat to switch to (--to <chatId>)');
  const origin: ChatTarget = { chatId: String(args.chatId ?? ''), group: args.group ?? null, groupId: args.groupId ?? null };
  await deps.startSend(page, args.line);
  const observedGenerating = await deps.waitGenerating(page, 60000);
  const otherGroup = Boolean(args.toGroup && args.toGroup !== args.group) || Boolean(args.toGroupId && args.toGroupId !== args.groupId);
  if (otherGroup) await deps.waitIdle(page, options.timeoutMs ?? 600000);
  await deps.openChat(page, { chatId: args.to, group: args.toGroup ?? args.group ?? null, groupId: args.toGroupId ?? (args.toGroup ? null : args.groupId ?? null) });
  await deps.waitIdle(page, options.timeoutMs ?? 600000);
  const target = await chatProbe(page);
  await deps.openChat(page, origin);
  await deps.waitIdle(page, options.timeoutMs ?? 600000);
  const back = await chatProbe(page);
  const problems = [
    ...(target.chatId !== args.to ? [`the switch did not land on ${args.to} (open: ${target.chatId})`] : []),
    ...(back.chatId !== origin.chatId ? [`could not return to ${origin.chatId} (open: ${back.chatId})`] : []),
    ...(target.last?.isUser && target.last.text.trim() === args.line.trim() ? ['the player line reached the chat switched to'] : []),
  ];
  const switchedAt = otherGroup ? 'after-reply' : 'mid-generation';
  return { did: { line: args.line, from: origin.chatId, to: args.to, observedGenerating, switchedAt, target, back }, problems };
}

async function reloadMidGen(page: any, args: MutationArgs, deps: LiveDeps, options: LiveOptions) {
  if (!args.line) throw new Error('reload-mid-gen needs a player line to start the generation');
  const origin: ChatTarget = { chatId: String(args.chatId ?? ''), group: args.group ?? null, groupId: args.groupId ?? null };
  const before = await chatProbe(page);
  await deps.startSend(page, args.line);
  const observedGenerating = await deps.waitGenerating(page, 60000);
  await deps.reload(page);
  await armTurnRecorder(page);
  await deps.openChat(page, origin);
  await deps.waitIdle(page, options.timeoutMs ?? 600000);
  const after = await chatProbe(page);
  const problems = after.chatId !== origin.chatId ? [`could not reopen ${origin.chatId} after the reload (open: ${after.chatId})`] : [];
  return { did: { line: args.line, observedGenerating, before, after, reloaded: true }, problems };
}

export async function runMutation(page: any, verb: MutationVerb, args: MutationArgs, deps: LiveDeps, options: LiveOptions = {}) {
  const startedAt = deps.now();
  const { cursor } = await armTurnRecorder(page);
  const before = await readLive(page);
  let outcome: { did: Record<string, unknown>; problems: string[] };
  if (verb === 'swipe-new') outcome = await swipeNew(page, deps, options);
  else if (verb === 'regen') outcome = await regen(page, deps, options);
  else if (verb === 'edit') outcome = await editLine(page, args, deps);
  else if (verb === 'delete') outcome = await deleteOne(page, args, deps);
  else if (verb === 'switch-chat-mid-gen') outcome = await switchMidGen(page, { ...args, chatId: args.chatId ?? before.chatId ?? '', groupId: args.groupId ?? before.groupId ?? null }, deps, options);
  else if (verb === 'reload-mid-gen') outcome = await reloadMidGen(page, { ...args, chatId: args.chatId ?? before.chatId ?? '', groupId: args.groupId ?? before.groupId ?? null }, deps, options);
  else throw new Error(`unknown mutation ${String(verb)}`);
  const actedAt = deps.now();
  const schedulerError = await settle(page, deps, options);
  const settledAt = deps.now();
  const after = await readLive(page, Math.max(0, before.chatLength - 2));
  const recorder = (await readRecorder(page, verb === 'reload-mid-gen' ? 0 : cursor)).events;
  const problems = [...outcome.problems, ...(schedulerError ? [`scheduler did not settle: ${schedulerError}`] : [])];
  return composeMutation({ verb, args: { ...args }, before, after, recorder, did: outcome.did, timing: { startedAt, actedAt, settledAt, endedAt: deps.now() }, problems });
}

const DRAWER_TOGGLE = '#so-drawer .drawer-toggle';

const drawerOpen = (page: any) => evaluateInST(page, () => (globalThis as any).document?.getElementById('drawer-manager')?.classList.contains('openDrawer') ?? false);

export async function flagMoment(page: any, note: string, { via = 'drawer', click }: { via?: 'drawer' | 'slash'; click?: (page: any, selector: string) => Promise<void> } = {}) {
  const countFlags = () => evaluateInST(page, () => ((globalThis as any).storyOrchestratorRuntime?.getSessionJournal?.() ?? []).filter((event: any) => event.kind === 'flag').length);
  const press = click ?? (async (target: any, selector: string) => { await target.locator(selector).first().click({ force: true, timeout: 10000 }); });
  const before = await countFlags();
  const wasOpen = await drawerOpen(page);
  let used = via;
  let fallbackReason: string | null = null;
  if (via === 'drawer') {
    try {
      if (!wasOpen) await press(page, DRAWER_TOGGLE);
      await press(page, '#so-flag-moment');
      await page.locator('#so-flag-note').fill(note);
      await page.locator('#so-flag-note').press('Enter');
    } catch (error) {
      used = 'slash';
      fallbackReason = error instanceof Error ? error.message : String(error);
    }
  }
  if (used === 'slash') {
    await evaluateInST(page, async (text: string) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      await ctx.executeSlashCommandsWithOptions(`/story flag ${text.replace(/\|/g, '/')}`);
    }, note);
  }
  const deadline = Date.now() + 5000;
  let after = await countFlags();
  while (after <= before && Date.now() < deadline) {
    await page.waitForTimeout(200);
    after = await countFlags();
  }
  const latest = await evaluateInST(page, () => {
    const events = ((globalThis as any).storyOrchestratorRuntime?.getSessionJournal?.() ?? []).filter((event: any) => event.kind === 'flag');
    return events[events.length - 1] ?? null;
  });
  let restoreError: string | null = null;
  if (await drawerOpen(page) !== wasOpen) {
    try { await press(page, DRAWER_TOGGLE); } catch (error) { restoreError = error instanceof Error ? error.message : String(error); }
  }
  const endOpen = await drawerOpen(page);
  const drawer = { before: wasOpen, after: endOpen, restored: endOpen === wasOpen, ...(restoreError ? { error: restoreError } : {}) };
  return { kind: 'flag' as const, at: new Date().toISOString(), note, via: used, fallbackReason, landed: after > before, flag: latest, drawer, problems: drawer.restored ? [] : [`the drawer was left ${endOpen ? 'open' : 'closed'} (it was ${wasOpen ? 'open' : 'closed'} before the flag)`], ok: after > before };
}

const readRecap = (page: any, since: string, chatId: string) => evaluateInST(page, ({ since, chatId }: { since: string; chatId: string }) => {
  const events: any[] = (globalThis as any).storyOrchestratorRuntime?.getSessionJournal?.() ?? [];
  const fresh = events.filter((event) => event?.kind === 'story' && typeof event.summary === 'string' && event.summary.startsWith('away recap') && Date.parse(event.at) >= Date.parse(since) && JSON.stringify(event.detail ?? '').includes(chatId));
  const shown = fresh.filter((event) => event.summary === 'away recap shown').pop() ?? null;
  const decision = fresh.filter((event) => event.summary === 'away recap queued' || event.summary === 'away recap not due').pop() ?? null;
  const doc = (globalThis as any).document;
  const popup = doc?.querySelector?.('dialog[open] .popup-content')?.textContent?.slice(0, 300) ?? null;
  return { shown, decision, popup };
}, { since, chatId });

export async function backdateSession(page: any, hours: number, deps: Pick<LiveDeps, 'reload' | 'openChat'>, target: ChatTarget | null, { waitMs = 30000 }: { waitMs?: number } = {}) {
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('--age needs a positive number of hours');
  const written = await evaluateInST(page, async (offsetMs: number) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const blob = ctx.chatMetadata?.story_orchestrator;
    const id = blob?.selectedStoryId;
    const record = id ? blob?.stories?.[id] : null;
    if (!record?.extras) return { ok: false, reason: 'the open chat carries no story state to backdate', chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null };
    const before = record.extras.lastSessionAt ?? null;
    const writtenAt = new Date().toISOString();
    const at = new Date(Date.now() - offsetMs).toISOString();
    record.extras.lastSessionAt = at;
    await ctx.saveMetadata();
    return { ok: true, chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, storyId: id, before, at, writtenAt };
  }, Math.round(hours * 3600000));
  if (!written.ok) return { ...written, hours, recap: null, decision: null, popup: null, fired: false, reopened: null };
  const reopen: ChatTarget = { chatId: target?.chatId ?? String(written.chatId ?? ''), group: target?.group ?? null, groupId: target?.groupId ?? written.groupId ?? null };
  await deps.reload(page);
  await deps.openChat(page, reopen);
  const deadline = Date.now() + waitMs;
  let read = await readRecap(page, String(written.writtenAt), reopen.chatId);
  while (!read.shown && Date.now() < deadline) {
    await page.waitForTimeout(250);
    read = await readRecap(page, String(written.writtenAt), reopen.chatId);
  }
  return { ...written, hours, recap: read.shown, decision: read.decision, popup: read.popup, fired: Boolean(read.shown), reopened: reopen };
}

export async function runGuardedTurn(page: any, line: string, deps: LiveDeps, options: LiveOptions = {}) {
  const record = await runTurn(page, line, deps, options);
  const defects: ModelDefect[] = modelDefects(record.replies.map((reply) => ({ messageId: reply.messageId, speaker: reply.speaker, text: reply.text })));
  if (!defects.length) return { ...record, modelDefect: null, modelDefects: [], autoRepair: null };
  const first = defects.find((defect) => defect.kind === 'loop') ?? defects[0];
  const modelDefect = { kind: first.kind, messageId: first.messageId, sample: first.sample };
  if (options.loopGuard === false) return { ...record, modelDefect, modelDefects: defects, autoRepair: { skipped: 'loop guard off', swiped: false } };
  const flag = await deps.flag(page, `model defect: ${first.kind}`);
  const target = await replyTarget(page);
  const lastDefective = target.id !== null && !target.isUser && defects.some((defect) => defect.messageId === target.id);
  if (!lastDefective) {
    return { ...record, modelDefect, modelDefects: defects, autoRepair: { flag, swiped: false, skipped: `the defective reply is not the last character reply (last ${target.id ?? 'none'}); ST swipes only the last message` } };
  }
  const swipe = await runMutation(page, 'swipe-new', {}, deps, options);
  const after = await replyTarget(page);
  const stillDefective = after.id === target.id ? modelDefects([{ messageId: after.id, text: await messageText(page, after.id) }]) : [];
  return { ...record, modelDefect, modelDefects: defects, autoRepair: { flag, swiped: swipe.ok === true, swipe, stillDefective } };
}

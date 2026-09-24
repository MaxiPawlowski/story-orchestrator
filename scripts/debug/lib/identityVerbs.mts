// v2.4 plan 02 §10 (X11): the verbs chat identity and silent mutation are asserted through. Each reads
// what the runtime actually recorded or would actually read, never a recomputation of it.
import { evaluateInST } from './evaluate.mts';

type Page = Parameters<typeof evaluateInST>[0];

export const ROLLBACK_RESULTS = ['applied', 'noop', 'history-unavailable', 'none'] as const;
export type RollbackResult = (typeof ROLLBACK_RESULTS)[number];
export type RollbackRecord = { seq: number; result: Exclude<RollbackResult, 'none'>; fromMessage: number | null; reason?: string; at: string };
export type RollbackOutcomeSpec = { result: RollbackResult; fromMessage?: number; reason?: string; since?: string };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function rollbackOutcomeSpec(value: unknown): RollbackOutcomeSpec {
  if (!isRecord(value)) throw new Error('expect.rollbackOutcome: expected {result, fromMessage?, reason?, since?}');
  const result = value.result as RollbackResult;
  if (!ROLLBACK_RESULTS.includes(result)) throw new Error(`expect.rollbackOutcome.result: expected one of ${ROLLBACK_RESULTS.join(', ')}, got ${JSON.stringify(value.result)}`);
  if (value.fromMessage !== undefined && !Number.isInteger(value.fromMessage)) throw new Error('expect.rollbackOutcome.fromMessage: expected an integer message id');
  if (value.since !== undefined && (typeof value.since !== 'string' || !value.since)) throw new Error('expect.rollbackOutcome.since: expected a record_state label');
  if (result === 'none' && value.since === undefined) throw new Error('expect.rollbackOutcome: result "none" needs `since` (a record_state label), or it would read every rollback this page ever ran');
  if (result === 'none' && (value.fromMessage !== undefined || value.reason !== undefined)) throw new Error('expect.rollbackOutcome: result "none" takes no fromMessage or reason');
  return {
    result,
    ...(value.fromMessage !== undefined ? { fromMessage: value.fromMessage as number } : {}),
    ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
    ...(typeof value.since === 'string' ? { since: value.since } : {}),
  };
}

const describeRecord = (record: RollbackRecord) => `${record.result} from ${record.fromMessage ?? 'no id'}${record.reason ? ` (${record.reason})` : ''}, seq ${record.seq}`;

export function rollbackOutcomeFailures(spec: RollbackOutcomeSpec, last: RollbackRecord | null, sinceSeq: number | null): string[] {
  const fresh = last && (sinceSeq === null || last.seq > sinceSeq) ? last : null;
  const window = spec.since ? ` since "${spec.since}"` : '';
  if (spec.result === 'none') return fresh ? [`expected no rollback${window}, got ${describeRecord(fresh)}`] : [];
  if (!fresh) return [`expected a ${spec.result} rollback${window}, but no rollback ran${last ? ` (the last one was ${describeRecord(last)})` : ''}`];
  const failures: string[] = [];
  if (fresh.result !== spec.result) failures.push(`expected a ${spec.result} rollback${window}, got ${describeRecord(fresh)}`);
  if (spec.fromMessage !== undefined && fresh.fromMessage !== spec.fromMessage) failures.push(`expected the rollback to start at message ${spec.fromMessage}, it started at ${fresh.fromMessage ?? 'no id'}`);
  if (spec.reason !== undefined && !(fresh.reason ?? '').includes(spec.reason)) failures.push(`expected the rollback reason to contain "${spec.reason}", got ${JSON.stringify(fresh.reason ?? null)}`);
  return failures;
}

export async function readRollbackOutcome(page: Page, since: string | null) {
  return evaluateInST(page, (label: string | null) => {
    const notices = (globalThis as any).storyOrchestratorRuntime?.notices;
    if (!notices || typeof notices !== 'object') return { available: false, last: null, sinceSeq: null, recorded: false };
    const recording = label === null ? null : ((globalThis as any).__soRecordedStates ?? {})[label] ?? null;
    return {
      available: true,
      last: notices.lastOutcome ?? null,
      sinceSeq: recording ? Number(recording.rollbackSeq ?? 0) : null,
      recorded: label === null || Boolean(recording),
    };
  }, since);
}

export async function expectRollbackOutcome(page: Page, value: unknown) {
  const spec = rollbackOutcomeSpec(value);
  const read = await readRollbackOutcome(page, spec.since ?? null);
  if (!read.available) throw new Error('expect.rollbackOutcome: the runtime exposes no notices (storyOrchestratorRuntime.notices), so this build records no rollback outcome');
  if (!read.recorded) throw new Error(`expect.rollbackOutcome: nothing was recorded as "${spec.since}" (record_state first; a reload clears recordings)`);
  const failures = rollbackOutcomeFailures(spec, read.last, read.sinceSeq);
  if (failures.length) throw new Error(failures.join('; '));
  return { rollbackOutcome: spec, last: read.last, sinceSeq: read.sinceSeq };
}

export type NextReadWindowSpec = { includes?: number[]; excludes?: number[] };
export type NextRead = { source: string; reason: string; window: { from: number; to: number; messages: Array<{ messageId: number }> } };

export function nextReadWindowSpec(value: unknown): NextReadWindowSpec {
  if (!isRecord(value)) throw new Error('expect.nextReadWindow: expected {includes?, excludes?}');
  const unknown = Object.keys(value).filter((key) => key !== 'includes' && key !== 'excludes');
  if (unknown.length) throw new Error(`expect.nextReadWindow: unknown key ${unknown.join(', ')}`);
  const ids = (key: 'includes' | 'excludes') => {
    const list = value[key];
    if (list === undefined) return undefined;
    if (!Array.isArray(list) || !list.length || !list.every((id) => Number.isInteger(id) && (id as number) >= 0)) throw new Error(`expect.nextReadWindow.${key}: expected a non-empty list of message ids`);
    return list as number[];
  };
  const includes = ids('includes');
  const excludes = ids('excludes');
  if (!includes && !excludes) throw new Error('expect.nextReadWindow: name includes or excludes, or it asserts nothing');
  return { ...(includes ? { includes } : {}), ...(excludes ? { excludes } : {}) };
}

export function nextReadWindowFailures(spec: NextReadWindowSpec, next: NextRead | null, chatLength: number): string[] {
  if (!next) return ['the scheduler has no next read: no stable message yet, or no scheduler is running'];
  const { from, to, messages } = next.window;
  if (to < from || !messages.length) return [`the next read (${next.source}) is empty (${from}..${to}), so any exclusion would pass vacuously`];
  if (from < 0 || to >= chatLength) return [`the next read (${next.source}) spans ${from}..${to}, outside the chat (length ${chatLength})`];
  const read = new Set(messages.map((message) => message.messageId));
  const failures: string[] = [];
  const missing = (spec.includes ?? []).filter((id) => !read.has(id));
  const present = (spec.excludes ?? []).filter((id) => read.has(id));
  if (missing.length) failures.push(`the next read (${next.source} ${from}..${to}) leaves out message(s) ${missing.join(', ')} (it reads ${[...read].join(', ')})`);
  if (present.length) failures.push(`the next read (${next.source} ${from}..${to}) still reads message(s) ${present.join(', ')}`);
  return failures;
}

export async function expectNextReadWindow(page: Page, value: unknown) {
  const spec = nextReadWindowSpec(value);
  const read = await evaluateInST(page, () => {
    const scheduler = (globalThis as any).storyOrchestratorScheduler;
    const chat = (globalThis as any).SillyTavern.getContext().chat;
    return { available: typeof scheduler?.nextReadWindow === 'function', next: scheduler?.nextReadWindow?.() ?? null, chatLength: Array.isArray(chat) ? chat.length : 0 };
  });
  if (!read.available) throw new Error('expect.nextReadWindow: this build exposes no storyOrchestratorScheduler.nextReadWindow');
  const failures = nextReadWindowFailures(spec, read.next, read.chatLength);
  if (failures.length) throw new Error(failures.join('; '));
  const window = read.next!.window;
  return { nextReadWindow: spec, source: read.next!.source, from: window.from, to: window.to, reads: window.messages.map((message) => message.messageId) };
}

export type BranchSpec = { mesId: number | 'last'; kind: 'branch' | 'checkpoint'; name?: string; open: boolean };

export function branchSpec(value: unknown): BranchSpec {
  const raw = isRecord(value) ? value : { mesId: value };
  const mesId = raw.mesId === undefined ? 'last' : raw.mesId;
  if (mesId !== 'last' && !(Number.isInteger(mesId) && (mesId as number) >= 0)) throw new Error(`branch_create.mesId: expected a message id or "last", got ${JSON.stringify(raw.mesId)}`);
  const kind = raw.kind === undefined ? 'branch' : raw.kind;
  if (kind !== 'branch' && kind !== 'checkpoint') throw new Error(`branch_create.kind: expected "branch" or "checkpoint", got ${JSON.stringify(raw.kind)}`);
  if (raw.name !== undefined && (typeof raw.name !== 'string' || !/^[\w .#-]+$/.test(raw.name))) throw new Error('branch_create.name: letters, digits, spaces, ".", "#" and "-" only, so the slash command cannot misparse it');
  if (kind === 'branch' && raw.name !== undefined) throw new Error('branch_create.name: ST names a branch itself; only a checkpoint takes a name');
  if (kind === 'branch' && raw.open === false) throw new Error('branch_create.open: /branch-create always opens the branch');
  return { mesId: mesId as number | 'last', kind, ...(typeof raw.name === 'string' ? { name: raw.name } : {}), open: kind === 'branch' ? true : raw.open === true };
}

export function branchCommand(spec: BranchSpec, lastMessageId: number): string {
  const mesId = spec.mesId === 'last' ? lastMessageId : spec.mesId;
  if (!(mesId >= 0)) throw new Error('branch_create: the chat has no message to branch from');
  return spec.kind === 'branch' ? `/branch-create ${mesId}` : `/checkpoint-create mesId=${mesId}${spec.name ? ` ${spec.name}` : ''}`;
}

export type BranchGuard = { groupId: string; owned: string[]; preexisting: string[]; branchChats?: string[] };

/** The only way a branch enters the run's ledger: a new name in the pinned group, never one that existed before. */
export function adoptBranchChat(guard: BranchGuard, spec: BranchSpec, created: { name: string; groupId: string | null; chatId: string | null }) {
  if (!created.name) throw new Error(`branch_create: ST created no ${spec.kind} (the command returned no name)`);
  if (created.groupId !== guard.groupId) throw new Error(`branch_create: the page left the sandbox group (now ${created.groupId ?? 'no group'})`);
  if (guard.preexisting.includes(created.name)) throw new Error(`branch_create: "${created.name}" existed before the run, so it is not the run's to own`);
  if (spec.open && created.chatId !== created.name) throw new Error(`branch_create: expected the page on "${created.name}", it is on ${created.chatId ?? 'no chat'}`);
  guard.branchChats = guard.branchChats ?? [];
  if (!guard.branchChats.includes(created.name)) guard.branchChats.push(created.name);
  if (!guard.owned.includes(created.name)) guard.owned.push(created.name);
  return { name: created.name, kind: spec.kind, opened: spec.open, branchChats: [...guard.branchChats] };
}

export async function branchCreate(page: Page, value: unknown, guard: BranchGuard | null) {
  const spec = branchSpec(value);
  if (!guard) throw new Error('branch_create needs --sandbox: the cleanup that deletes the branch chat is the sandbox cleanup');
  const probe = await evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return { groupId: ctx.groupId ?? null, last: (ctx.chat?.length ?? 0) - 1 };
  });
  if (probe.groupId !== guard.groupId) throw new Error(`branch_create: the page is not on the sandbox group (${probe.groupId ?? 'no group'})`);
  const command = branchCommand(spec, probe.last);
  const created = await evaluateInST(page, async ({ command, open, groupId }: { command: string; open: boolean; groupId: string }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const result = await ctx.executeSlashCommandsWithOptions(command);
    const name = typeof result?.pipe === 'string' ? result.pipe.trim() : '';
    const after = (globalThis as any).SillyTavern.getContext();
    if (name && open && after.chatId !== name) await after.openGroupChat(groupId, name);
    const now = (globalThis as any).SillyTavern.getContext();
    return { name, groupId: now.groupId ?? null, chatId: now.chatId ?? null };
  }, { command, open: spec.open, groupId: guard.groupId });
  return { command, ...adoptBranchChat(guard, spec, created) };
}

export type BranchChatReport = { recorded: string[]; deleted: string[]; failed: string[]; leaked: string[] };

export function branchChatReport(recorded: string[], attempts: Array<{ name: string; ok: boolean }>, presentAfter: string[]): BranchChatReport {
  const present = new Set(presentAfter);
  return {
    recorded: [...recorded],
    deleted: recorded.filter((name) => !present.has(name)),
    failed: attempts.filter((attempt) => !attempt.ok).map((attempt) => attempt.name),
    leaked: recorded.filter((name) => present.has(name)),
  };
}

async function presentBranchChats(page: Page, groupId: string, names: string[]): Promise<string[]> {
  return evaluateInST(page, async ({ groupId, names }: { groupId: string; names: string[] }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const post = async (url: string, body: unknown) => (await fetch(url, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) })).json().catch(() => null);
    const groups = await post('/api/groups/all', {});
    const listed: string[] = (Array.isArray(groups) ? groups.find((entry: { id: string }) => entry.id === groupId)?.chats : null) ?? [];
    const present: string[] = [];
    for (const name of names) {
      const data = await post('/api/chats/group/get', { id: name });
      if (listed.includes(name) || (Array.isArray(data) && data.length)) present.push(name);
    }
    return present;
  }, { groupId, names });
}

/**
 * Runs after the sandbox chats are deleted. Re-opens the pinned group, deletes only the names this run
 * recorded, waits out ST's 1 s group-save debounce (group-chats.js:140) and reads the server back, so a
 * branch that came back reads as leaked rather than deleted.
 */
export async function cleanupBranchChats(page: Page, guard: BranchGuard, { settleMs = 2500 } = {}): Promise<BranchChatReport> {
  const recorded = [...(guard.branchChats ?? [])];
  if (!recorded.length) return branchChatReport([], [], []);
  const before = await presentBranchChats(page, guard.groupId, recorded);
  const attempts: Array<{ name: string; ok: boolean }> = [];
  if (before.length) {
    const outcome = await evaluateInST(page, async ({ groupId, names }: { groupId: string; names: string[] }) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const module = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as {
        groups: Array<{ id: string; chats: string[] }>;
        openGroupById: (id: string) => Promise<unknown>;
        deleteGroupChat: (groupId: string, chatId: string, options?: { jumpToNewChat?: boolean }) => Promise<void>;
      };
      if (ctx.groupId !== groupId) await module.openGroupById(groupId);
      const attempts: Array<{ name: string; ok: boolean }> = [];
      for (const name of names) {
        const group = module.groups.find((entry) => entry.id === groupId);
        const open = (globalThis as any).SillyTavern.getContext().chatId === name;
        try {
          if (group?.chats.includes(name)) await module.deleteGroupChat(groupId, name, { jumpToNewChat: open });
          else {
            const response = await fetch('/api/chats/group/delete', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ id: name }) });
            if (!response.ok) throw new Error(`answered ${response.status}`);
          }
          attempts.push({ name, ok: true });
        } catch {
          attempts.push({ name, ok: false });
        }
      }
      return attempts;
    }, { groupId: guard.groupId, names: before });
    attempts.push(...outcome);
    if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
  }
  return branchChatReport(recorded, attempts, await presentBranchChats(page, guard.groupId, recorded));
}

export type ReapPromptReport = { dismissed: string[]; leaked: string[] };

/**
 * v2.4 plan 02 T14. Deleting a sandbox chat whose mirror book carries the `so-owner` marker makes the
 * product ask whether to delete that book too (`runtime/mirrorReaperHost.ts`). The run's own cleanup
 * deletes the book, so every such question naming a chat this run owned is declined here, after the
 * mirror-book cleanup: the reaper then finds the book gone and leaves no Repair row. The product asks
 * one question at a time, so this waits for a quiet spell rather than taking one pass. A question
 * still open at the end is reported leaked, because a modal left behind blocks the next run.
 */
export async function settleReapPrompts(page: Page, owned: string[], { quietMs = 1500, timeoutMs = 20000, pollMs = 100 } = {}): Promise<ReapPromptReport> {
  if (!owned.length) return { dismissed: [], leaked: [] };
  return evaluateInST(page, async ({ owned, quietMs, timeoutMs, pollMs }: { owned: string[]; quietMs: number; timeoutMs: number; pollMs: number }) => {
    const answered = new WeakSet<Element>();
    const prompts = (includeAnswered = false) => [...document.querySelectorAll('dialog[open]')]
      .filter((dialog) => includeAnswered || !answered.has(dialog))
      .map((dialog) => ({ dialog, text: dialog.querySelector('.popup-content')?.textContent ?? '' }))
      .filter(({ text }) => owned.some((id) => text.startsWith(`The chat "${id}" was deleted`)));
    const dismissed: string[] = [];
    const started = Date.now();
    let lastSeen = Date.now();
    while (Date.now() - lastSeen < quietMs && Date.now() - started < timeoutMs) {
      const [open] = prompts();
      if (open) {
        answered.add(open.dialog);
        (open.dialog.querySelector('.popup-button-cancel') as HTMLElement | null)?.click();
        dismissed.push(open.text.slice(0, 200));
        lastSeen = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return { dismissed, leaked: prompts(true).map(({ text }) => text.slice(0, 200)) };
  }, { owned, quietMs, timeoutMs, pollMs });
}

import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { evaluateInST } from './lib/evaluate.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

const USAGE = `Usage: node scripts/debug/so-save-recorder.mts arm | drain [--out <file.jsonl>] | disarm

v2.5 plan 02 C2 step 1. Records every chat save the page posts (/api/chats/save, /api/chats/group/save):
the file it names, the integrity and row count it carries, what ST had open at post time (chatId,
groupId, characterId), the answer status, and the stack of the post. Also stack-traces every
context saveMetadata() call, so a save can be attributed to its caller. drain prints the records and
flags a save that carries an integrity already seen for ANOTHER file, or that names a file other than
the chat open when saveMetadata was asked. The recorder lives in the page until disarm or a reload.`;

export interface SaveRecord {
  seq: number;
  at: number;
  url: string;
  file: string | null;
  integrity: string | null;
  rows: number | null;
  open: { chatId: string | null; groupId: string | null; characterId: string | null };
  status: number | null;
  error: string | null;
  stack: string;
}

export interface MetadataCall {
  seq: number;
  at: number;
  open: { chatId: string | null; groupId: string | null; characterId: string | null };
  stack: string;
}

export interface RecorderState {
  saves: SaveRecord[];
  metadataCalls: MetadataCall[];
}

export async function armSaveRecorder(page: Pick<Page, 'evaluate'>) {
  return evaluateInST(page as Page, () => {
    const g = globalThis as any;
    if (g.__soSaveRecorder) return { ok: true, armed: true, already: true };
    Error.stackTraceLimit = 60;
    const state = { saves: [] as any[], metadataCalls: [] as any[], seq: 0, fetch: g.fetch, getContext: g.SillyTavern.getContext };
    const openNow = () => {
      const ctx = state.getContext.call(g.SillyTavern);
      return { chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, characterId: ctx.characterId === undefined || ctx.characterId === null ? null : String(ctx.characterId) };
    };
    g.fetch = async function (input: any, init: any) {
      const url = typeof input === 'string' ? input : String(input?.url ?? '');
      if (!url.includes('/api/chats/save') && !url.includes('/api/chats/group/save')) return state.fetch.call(this, input, init);
      let body: any = null;
      try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; } catch { body = null; }
      const header = Array.isArray(body?.chat) ? body.chat[0] : null;
      const hasHeader = Boolean(header) && typeof header === 'object' && 'chat_metadata' in header;
      const record = {
        seq: ++state.seq,
        at: Date.now(),
        url,
        file: typeof body?.id === 'string' ? body.id : typeof body?.file_name === 'string' ? body.file_name : null,
        integrity: typeof header?.chat_metadata?.integrity === 'string' ? header.chat_metadata.integrity : null,
        rows: Array.isArray(body?.chat) ? body.chat.length - (hasHeader ? 1 : 0) : null,
        open: openNow(),
        status: null as number | null,
        error: null as string | null,
        stack: String(new Error('save posted').stack ?? ''),
      };
      state.saves.push(record);
      try {
        const response = await state.fetch.call(this, input, init);
        record.status = response.status;
        return response;
      } catch (error: any) {
        record.error = String(error?.message ?? error);
        throw error;
      }
    };
    g.SillyTavern.getContext = function () {
      const ctx = state.getContext.call(g.SillyTavern);
      const saveMetadata = ctx.saveMetadata;
      if (typeof saveMetadata !== 'function') return ctx;
      return { ...ctx, saveMetadata: (...args: unknown[]) => {
        state.metadataCalls.push({ seq: ++state.seq, at: Date.now(), open: openNow(), stack: String(new Error('saveMetadata asked').stack ?? '') });
        return saveMetadata.apply(ctx, args);
      } };
    };
    g.__soSaveRecorder = state;
    return { ok: true, armed: true, already: false };
  });
}

export async function readSaveRecorder(page: Pick<Page, 'evaluate'>, take = true): Promise<RecorderState | null> {
  return evaluateInST(page as Page, (drain: boolean) => {
    const state = (globalThis as any).__soSaveRecorder;
    if (!state) return null;
    const out = { saves: state.saves.slice(), metadataCalls: state.metadataCalls.slice() };
    if (drain) { state.saves.length = 0; state.metadataCalls.length = 0; }
    return out;
  }, take);
}

export async function disarmSaveRecorder(page: Pick<Page, 'evaluate'>) {
  return evaluateInST(page as Page, () => {
    const g = globalThis as any;
    const state = g.__soSaveRecorder;
    if (!state) return { ok: false, disarmed: false };
    g.fetch = state.fetch;
    g.SillyTavern.getContext = state.getContext;
    delete g.__soSaveRecorder;
    return { ok: true, disarmed: true };
  });
}

export interface SaveFlag {
  seq: number;
  kind: 'foreign-integrity' | 'posted-elsewhere';
  detail: string;
}

export function flagSaves(state: RecorderState, known: Map<string, string> = new Map()): SaveFlag[] {
  const flags: SaveFlag[] = [];
  const events = [...state.saves.map((save) => ({ type: 'save' as const, save })), ...state.metadataCalls.map((call) => ({ type: 'ask' as const, call }))]
    .sort((left, right) => (left.type === 'save' ? left.save.seq : left.call.seq) - (right.type === 'save' ? right.save.seq : right.call.seq));
  const fileOf = new Map(known);
  let lastAsk: MetadataCall | null = null;
  for (const event of events) {
    if (event.type === 'ask') { lastAsk = event.call; continue; }
    const save = event.save;
    if (save.integrity && save.file) {
      const owner = fileOf.get(save.integrity);
      if (owner && owner !== save.file) flags.push({ seq: save.seq, kind: 'foreign-integrity', detail: `a save of "${save.file}" carried the integrity of "${owner}" (${save.rows} rows, status ${save.status})` });
      else if (!owner) fileOf.set(save.integrity, save.file);
    }
    if (lastAsk && save.file && lastAsk.open.chatId && lastAsk.open.chatId !== save.file) {
      flags.push({ seq: save.seq, kind: 'posted-elsewhere', detail: `saveMetadata was asked in "${lastAsk.open.chatId}" (seq ${lastAsk.seq}); the next save wrote "${save.file}" (${save.rows} rows)` });
    }
    lastAsk = null;
  }
  return flags;
}

export async function drainSaveRecorder(page: Pick<Page, 'evaluate'>, out: string | null = null) {
  const state = await readSaveRecorder(page, true);
  if (!state) return { ok: false, error: 'the recorder is not armed in this page (a reload removes it)' };
  const flags = flagSaves(state);
  if (out) for (const row of [...state.saves.map((save) => ({ kind: 'save', ...save })), ...state.metadataCalls.map((call) => ({ kind: 'ask', ...call }))]) await appendFile(out, JSON.stringify(row) + '\n');
  return { ok: true, saves: state.saves.length, metadataCalls: state.metadataCalls.length, flags, records: out ? undefined : state };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verb = process.argv[2];
  if (!verb || hasHelpFlag() || !['arm', 'drain', 'disarm'].includes(verb)) {
    console.log(USAGE);
    process.exit(verb && !hasHelpFlag() ? 1 : 0);
  }
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : null;
  runCli(async (page) => {
    const result: { ok?: boolean } = verb === 'arm' ? await armSaveRecorder(page) : verb === 'disarm' ? await disarmSaveRecorder(page) : await drainSaveRecorder(page, out);
    console.log(JSON.stringify(result, null, 2));
    return result;
  });
}

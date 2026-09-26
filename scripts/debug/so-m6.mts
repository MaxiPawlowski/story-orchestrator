import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { summarizeM6, type M6Row } from './lib/m6Contention.mts';

const USAGE = `Usage: node scripts/debug/so-m6.mts <follow|report> [options]

v2.5 plan 05 M6 (rate spacing / generation mutex spike). Measurement only.
follow --out <file.jsonl> [--interval-ms 2000]
    Arms an in-page recorder (re-armed after every reload) that wraps the memory-model seam
    (ConnectionManagerRequestService.sendRequest, which every pass calls through) and ST's
    GENERATION_STARTED/ENDED/STOPPED, and appends each finished row to the file. Run it in the
    background for the whole live batch (e.g. J7), on a single uncontended lane. Ctrl-C to stop.
report <file.jsonl>
    Classifies every memory-model call (ok / rate-limit / timeout / lapse / error) and counts
    timeouts that overlap a non-dry main generation in the same page epoch, against the
    predeclared floors (rpm spacing opens at >= 1 rate-limit failure, mutex deferral at >= 3
    coincident timeouts). Quote the numbers only for the route in the run header.`;

export function armM6InPage(): { armed: boolean; epoch: string } {
  const g = globalThis as Record<string, any>;
  if (g.__soM6) return { armed: false, epoch: g.__soM6.epoch };
  const ctx = g.SillyTavern.getContext();
  const state = { epoch: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, seq: 0, rows: [] as any[], drained: 0 };
  g.__soM6 = state;
  const service = ctx.ConnectionManagerRequestService;
  const inner = service.sendRequest;
  service.sendRequest = async function (profileId: string, prompt: unknown, maxTokens: number, custom: any, overridePayload: unknown) {
    const row: any = { kind: 'call', id: ++state.seq, epoch: state.epoch, t0: Date.now(), t1: null, profileId: profileId ?? null, ok: null };
    state.rows.push(row);
    try {
      const result = await inner.call(this, profileId, prompt, maxTokens, custom, overridePayload);
      row.ok = true;
      return result;
    } catch (error: any) {
      const reason = custom?.signal?.aborted ? custom.signal.reason : null;
      row.ok = false;
      row.errorName = error?.name ?? null;
      row.errorMessage = String(error?.message ?? error).slice(0, 300);
      row.abortReason = reason ? `${reason?.name ?? ''}: ${reason?.message ?? String(reason)}`.slice(0, 300) : null;
      throw error;
    } finally {
      row.t1 = Date.now();
    }
  };
  let open: any = null;
  const close = () => {
    if (open) open.t1 = Date.now();
    open = null;
  };
  ctx.eventSource.on(ctx.eventTypes.GENERATION_STARTED, (type: string, _params: unknown, dryRun: boolean) => {
    close();
    open = { kind: 'generation', id: ++state.seq, epoch: state.epoch, t0: Date.now(), t1: null, type: type ?? null, dry: dryRun === true };
    state.rows.push(open);
  });
  ctx.eventSource.on(ctx.eventTypes.GENERATION_ENDED, close);
  ctx.eventSource.on(ctx.eventTypes.GENERATION_STOPPED, close);
  return { armed: true, epoch: state.epoch };
}

function drainM6InPage(): { epoch: string | null; rows: unknown[] } {
  const state = (globalThis as Record<string, any>).__soM6;
  if (!state) return { epoch: null, rows: [] };
  const finished: unknown[] = [];
  while (state.drained < state.rows.length && state.rows[state.drained].t1 !== null) finished.push(state.rows[state.drained++]);
  return { epoch: state.epoch, rows: finished };
}

async function follow(page, out: string, intervalMs: number) {
  await mkdir(dirname(out), { recursive: true });
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.stdout.on('error', () => {});
  let written = 0;
  while (!stopped) {
    try {
      const armed = await evaluateInST(page, armM6InPage, undefined);
      if (armed.armed) await appendFile(out, `${JSON.stringify({ kind: 'epoch', epoch: armed.epoch, at: new Date().toISOString() })}\n`, 'utf-8');
      const { rows } = await evaluateInST(page, drainM6InPage, undefined);
      for (const row of rows) await appendFile(out, `${JSON.stringify(row)}\n`, 'utf-8');
      written += rows.length;
    } catch {
      // A reload destroys the context mid-read; the next poll re-arms in the new page.
    }
    await new Promise((done) => setTimeout(done, intervalMs));
  }
  return { ok: true, written };
}

export async function readM6(file: string): Promise<M6Row[]> {
  const text = await readFile(file, 'utf-8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.kind === 'call' || row.kind === 'generation');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valueOf = (name: string, fallback: string) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  if (hasHelpFlag() || !['follow', 'report'].includes(args[0])) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  if (args[0] === 'report') {
    if (!args[1]) {
      console.log(USAGE);
      process.exit(1);
    }
    const summary = summarizeM6(await readM6(resolve(process.cwd(), args[1])));
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const out = valueOf('--out', '');
    if (!out) {
      console.log(USAGE);
      process.exit(1);
    }
    runCli((page) => follow(page, resolve(process.cwd(), out), Number(valueOf('--interval-ms', '2000')) || 2000), { keepOpen: true });
  }
}

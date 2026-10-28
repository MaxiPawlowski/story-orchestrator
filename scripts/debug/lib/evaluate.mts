// Safe wrapper around page.evaluate() for extracting data from the ST browser context.
//
// Handles JSON serialization edge cases (functions, circular refs, undefined)
// and provides clear error messages on evaluation failure.

import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { connectToST } from './connection.mts';
import { ensureSTReady } from './st-ready.mts';

// The closure passed to page.evaluate() runs inside the ST browser page, against
// window.SillyTavern's dynamically-shaped runtime context - not worth fabricating
// types for here (see CLAUDE.md: don't guess at unconfirmed ST value shapes).
// Only the outer Node-side plumbing (page, return value) is meaningfully typed.
// v3.0 end batch 2 (D-EB3): an async evaluation awaited through CDP (`awaitPromise`) was answered
// "Promise was collected" while the page had not navigated and the in-page work went on to finish, and
// Playwright rewrites every non-script protocol error into "Execution context was destroyed", so J6
// read it as a navigation (record in docs/plans/v3.0/00-overview.md). An async function now runs as a
// page-side job: one synchronous call starts it and holds its promise on the page, short synchronous
// polls collect the outcome, and only a job the page no longer knows (a reload) reads as a navigation.
export const EVAL_JOB_POLL_MS = 100;
const EVAL_JOBS = '__soEvalJobs';

type EvalJobOutcome = { state: 'pending' } | { state: 'ok'; value: unknown } | { state: 'error'; name: string; message: string } | { state: 'lost' };

const isAsyncFunction = (fn: unknown) => typeof fn === 'function' && fn.constructor?.name === 'AsyncFunction';
const isPlaywrightPage = (page: unknown) => typeof (page as { mainFrame?: unknown })?.mainFrame === 'function';

export function startEvalJob({ source, arg, id, slot }: { source: string; arg: unknown; id: string; slot: string }): boolean {
  let fn: (value: unknown) => unknown;
  try {
    fn = (0, eval)(`(${source})`);
  } catch {
    return false;
  }
  if (typeof fn !== 'function') return false;
  const root = globalThis as Record<string, any>;
  const jobs: Map<string, { outcome: EvalJobOutcome; promise?: Promise<unknown> }> = (root[slot] ??= new Map());
  const entry: { outcome: EvalJobOutcome; promise?: Promise<unknown> } = { outcome: { state: 'pending' } };
  jobs.set(id, entry);
  entry.promise = Promise.resolve().then(() => fn(arg)).then(
    (value) => { entry.outcome = { state: 'ok', value }; },
    (error) => { entry.outcome = { state: 'error', name: String(error?.name ?? 'Error'), message: String(error?.message ?? error) }; },
  );
  return true;
}

export function readEvalJob({ id, slot }: { id: string; slot: string }): EvalJobOutcome {
  const jobs = (globalThis as Record<string, any>)[slot] as Map<string, { outcome: EvalJobOutcome }> | undefined;
  const entry = jobs?.get(id);
  if (!entry) return { state: 'lost' };
  if (entry.outcome.state !== 'pending') jobs?.delete(id);
  return entry.outcome;
}

let jobSeq = 0;

async function evaluateAsJob<R>(page: Page, fn: (arg: any) => Promise<R>, arg: unknown, pollMs = EVAL_JOB_POLL_MS): Promise<{ started: false } | { started: true; value: R }> {
  const id = `${process.pid}-${Date.now()}-${++jobSeq}`;
  const started = await page.evaluate(startEvalJob, { source: fn.toString(), arg, id, slot: EVAL_JOBS });
  if (!started) return { started: false };
  for (;;) {
    const outcome = await page.evaluate(readEvalJob, { id, slot: EVAL_JOBS });
    if (outcome.state === 'ok') return { started: true, value: outcome.value as R };
    if (outcome.state === 'error') throw new Error(`page.evaluate: ${outcome.name}: ${outcome.message}`);
    if (outcome.state === 'lost') throw new Error('Execution context was destroyed: the page no longer holds the evaluation it started (it reloaded or navigated)');
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export async function evaluateInST<R = unknown>(page: Page, fn: (arg: any) => R | Promise<R>, arg?: any): Promise<R> {
  try {
    if (isAsyncFunction(fn) && isPlaywrightPage(page)) {
      const job = await evaluateAsJob(page, fn as (arg: any) => Promise<R>, arg);
      if (job.started) return job.value;
    }
    return await page.evaluate(fn, arg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Target closed') || message.includes('Session closed')) {
      throw new Error(`Browser closed - tab was closed during evaluation. ${message}`);
    }
    if (message.includes('Execution context was destroyed')) {
      throw new Error(`SillyTavern page navigated away during evaluation. ${message}`);
    }
    if (message.includes('Cannot find context')) {
      throw new Error(`Browser closed - browser context lost. ${message}`);
    }
    throw new Error(`Evaluation failed in SillyTavern page: ${message}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      console.log('Connecting and verifying evaluate...');
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;

      await ensureSTReady(page);

      const info = await evaluateInST(page, () => ({
        url: (globalThis as any).location.href,
        title: document.title,
        contextKeys: Object.keys((globalThis as any).SillyTavern.getContext()),
      }));
      console.log('Evaluation OK:');
      console.log(JSON.stringify(info, null, 2));
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}

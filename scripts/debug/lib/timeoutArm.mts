// v2.5 plan 02 / plan 05 F0 A11: the forced-timeout arm of live-v24-03-memorize. The arm scales every
// memory-model budget by `storyOrchestratorDebugCallBudgetScale` (src/extraction/callBudget.ts). One
// uniform scale has to make the whole-chat pass time out on its first ask and answer on its 2x retry,
// while every other pass still answers on its retry, or the backlog fails for a reason the arm is not
// about. The scale is read from a base run's measured passes, never guessed.

import { callTimeoutMs, TIMEOUT_RETRY_SCALE } from '../../../src/extraction/callBudget.ts';

export const A11_SCALE_KEY = 'so-v25-a11-scale';
export const A11_CONTROL_KEY = 'so-v25-a11-control';
export const A11_MARGIN = 0.1;

export interface MeasuredPass {
  n: number;
  ms: number;
  promptChars: number;
}

export interface BaseRun {
  maxTokens: number;
  passes: MeasuredPass[];
}

export type ScaleVerdict =
  | { ok: true; scale: number; lo: number; hi: number; full: { measuredMs: number; budgetMs: number; firstMs: number; retryMs: number } }
  | { ok: false; reason: string; lo?: number; hi?: number };

const budgetOf = (pass: MeasuredPass, maxTokens: number) => callTimeoutMs(maxTokens, Math.ceil(pass.promptChars / 4));

export function forcedTimeoutScale(run: BaseRun, margin = A11_MARGIN): ScaleVerdict {
  const passes = run.passes.filter((pass) => Number.isFinite(pass.ms) && pass.ms > 0 && pass.promptChars > 0);
  if (!passes.length) return { ok: false, reason: 'the base run has no answered pass with a duration' };
  if (!(run.maxTokens > 0)) return { ok: false, reason: 'the base run names no maxTokens for the whole-chat pass' };
  const full = passes[passes.length - 1];
  const lo = Math.max(...passes.map((pass) => (pass.ms * (1 + margin)) / (TIMEOUT_RETRY_SCALE * budgetOf(pass, run.maxTokens))));
  const hi = (full.ms * (1 - margin)) / budgetOf(full, run.maxTokens);
  if (!(lo < hi)) return { ok: false, reason: `no uniform scale times out the whole-chat pass (needs < ${hi.toFixed(3)}) while every pass still answers on its retry (needs > ${lo.toFixed(3)})`, lo, hi };
  if (hi > 1) return { ok: false, reason: 'the whole-chat pass already runs longer than its unscaled budget, so the base arm itself times out', lo, hi };
  const scale = Math.round(((lo + hi) / 2) * 1000) / 1000;
  const budgetMs = budgetOf(full, run.maxTokens);
  return { ok: true, scale, lo, hi, full: { measuredMs: full.ms, budgetMs, firstMs: Math.round(budgetMs * scale), retryMs: Math.round(budgetMs * scale) * TIMEOUT_RETRY_SCALE } };
}

interface StepSixteen {
  budget?: { maxTokens?: number } | null;
  requests?: Array<{ n?: number; kind?: string; outcome?: string; ms?: number | null; promptChars?: number }>;
  reasked?: Array<{ n?: number }>;
  timeoutRetries?: Array<{ first?: { n?: number } }>;
}

// The base fixture's last step logs `{ budget, requests, reasked, timeoutRetries, … }`. The passes are
// the answered reads in order, minus re-asks and minus a first ask that timed out.
export function baseRunFromLog(log: string): BaseRun {
  const lines = log.split(/\r?\n/).filter((line) => /\d+\/\d+ eval -> \{/.test(line) && line.includes('"estimateVsTrue"'));
  if (!lines.length) throw new Error('no base-run summary line (the memorize fixture\'s last step, with "estimateVsTrue") in this log');
  const text = lines[lines.length - 1].replace(/^.*?eval -> /, '');
  let parsed: StepSixteen;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('the base-run summary line is truncated or not JSON; raise that step\'s "log" budget and run it again');
  }
  const skipped = new Set([...(parsed.reasked ?? []).map((row) => row.n), ...(parsed.timeoutRetries ?? []).map((row) => row.first?.n)]);
  const passes = (parsed.requests ?? [])
    .filter((row) => row.kind === 'read' && row.outcome === 'ok' && !skipped.has(row.n))
    .map((row) => ({ n: Number(row.n), ms: Number(row.ms), promptChars: Number(row.promptChars) }));
  return { maxTokens: Number(parsed.budget?.maxTokens ?? 0), passes };
}

export const setScaleCommand = (scale: number) => `node scripts/debug/st-eval.mts "localStorage.setItem('${A11_SCALE_KEY}', '${scale}')"`;

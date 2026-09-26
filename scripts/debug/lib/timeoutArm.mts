import { callTimeoutMs, TIMEOUT_RETRY_SCALE } from '../../../src/extraction/callBudget.ts';

export const A11_SCALE_KEY = 'so-v25-a11-scale';
export const A11_CONTROL_KEY = 'so-v25-a11-control';
export const A11_TARGET_KEY = 'so-v25-a11-target';
export const A11_FULL_PASS_KIND = 'memorize:full';
export const A11_MARGIN = 0.1;

export const DEEP_ABORT_RETRY_COST = 1.85;
export const CACHE_REUSE_MAX_DEPTH = 0.5;
export const SHALLOW_RETRY_SLOWDOWN = 1.33;

export type ArmMode = 'whole' | 'targeted';

export interface MeasuredPass {
  n: number;
  ms: number;
  promptChars: number;
}

export interface BaseRun {
  maxTokens: number;
  passes: MeasuredPass[];
}

export interface FullPassPlan {
  measuredMs: number;
  budgetMs: number;
  firstMs: number;
  retryMs: number;
  abortDepth: number;
  cacheReuse: boolean;
  retryCostMs: number;
}

export type ScaleVerdict =
  | { ok: true; mode: ArmMode; scale: number; lo: number; hi: number; full: FullPassPlan }
  | { ok: false; mode: ArmMode; reason: string; lo?: number; hi?: number };

const budgetOf = (pass: MeasuredPass, maxTokens: number) => callTimeoutMs(maxTokens, Math.ceil(pass.promptChars / 4));

export const retryCostMs = (coldMs: number, depth: number): number =>
  depth <= CACHE_REUSE_MAX_DEPTH ? Math.max(0, 1 - depth) * coldMs * SHALLOW_RETRY_SLOWDOWN : coldMs * DEEP_ABORT_RETRY_COST;

function fullPassDepths(margin: number): { lo: number; hi: number } | null {
  const ceiling = 1 - margin;
  const shallowFloor = ((1 + margin) * SHALLOW_RETRY_SLOWDOWN) / (TIMEOUT_RETRY_SCALE + (1 + margin) * SHALLOW_RETRY_SLOWDOWN);
  const shallowTop = Math.min(CACHE_REUSE_MAX_DEPTH, ceiling);
  if (shallowFloor < shallowTop) return { lo: shallowFloor, hi: shallowTop };
  const deepFloor = Math.max(CACHE_REUSE_MAX_DEPTH, ((1 + margin) * DEEP_ABORT_RETRY_COST) / TIMEOUT_RETRY_SCALE);
  return deepFloor < ceiling ? { lo: deepFloor, hi: ceiling } : null;
}

const fixed = (value: number) => value.toFixed(3);

export function forcedTimeoutScale(run: BaseRun, mode: ArmMode = 'targeted', margin = A11_MARGIN): ScaleVerdict {
  const passes = run.passes.filter((pass) => Number.isFinite(pass.ms) && pass.ms > 0 && pass.promptChars > 0);
  if (!passes.length) return { ok: false, mode, reason: 'the base run has no answered pass with a duration' };
  if (!(run.maxTokens > 0)) return { ok: false, mode, reason: 'the base run names no maxTokens for the whole-chat pass' };
  const full = passes[passes.length - 1];
  const budgetMs = budgetOf(full, run.maxTokens);
  if (budgetMs <= full.ms) return { ok: false, mode, reason: 'the whole-chat pass already runs longer than its unscaled budget, so the base arm itself times out' };
  const depths = fullPassDepths(margin);
  if (!depths) return { ok: false, mode, reason: `no abort depth lets the whole-chat pass time out and still answer its ${TIMEOUT_RETRY_SCALE}x retry under the measured retry cost` };
  const perDepth = full.ms / budgetMs;
  const fullLo = depths.lo * perDepth;
  const fullHi = depths.hi * perDepth;
  const others = mode === 'whole' ? passes.slice(0, -1) : [];
  const slowest = others.reduce<{ pass: MeasuredPass; need: number } | null>((worst, pass) => {
    const need = (pass.ms * (1 + margin)) / budgetOf(pass, run.maxTokens);
    return !worst || need > worst.need ? { pass, need } : worst;
  }, null);
  const lo = Math.max(fullLo, slowest?.need ?? 0);
  const hi = fullHi;
  const fullNeeds = `the whole-chat pass (n=${full.n}, ${full.ms} ms) must time out at an abort depth of ${fixed(depths.lo)}-${fixed(depths.hi)} of its run so its ${TIMEOUT_RETRY_SCALE}x retry still answers (scale ${fixed(fullLo)}-${fixed(fullHi)})`;
  if (!(lo < hi)) {
    const otherNeeds = slowest ? `every other pass must answer on its first ask (needs > ${fixed(slowest.need)}, pass n=${slowest.pass.n} at ${slowest.pass.ms} ms)` : '';
    return { ok: false, mode, reason: `infeasible: ${[otherNeeds, fullNeeds].filter(Boolean).join(', while ')}`, lo, hi };
  }
  const scale = Math.round(((lo + hi) / 2) * 1000) / 1000;
  if (!(scale > lo && scale <= hi)) return { ok: false, mode, reason: `infeasible: the window ${fixed(lo)}-${fixed(hi)} is narrower than the 0.001 step the scale is set in`, lo, hi };
  const firstMs = Math.round(budgetMs * scale);
  const abortDepth = firstMs / full.ms;
  return {
    ok: true,
    mode,
    scale,
    lo,
    hi,
    full: { measuredMs: full.ms, budgetMs, firstMs, retryMs: firstMs * TIMEOUT_RETRY_SCALE, abortDepth: Math.round(abortDepth * 1000) / 1000, cacheReuse: abortDepth <= CACHE_REUSE_MAX_DEPTH, retryCostMs: Math.round(retryCostMs(full.ms, abortDepth)) },
  };
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

export const setScaleCommand = (scale: number, mode: ArmMode = 'targeted') => {
  const target = mode === 'targeted' ? `localStorage.setItem('${A11_TARGET_KEY}', '${A11_FULL_PASS_KIND}')` : `localStorage.removeItem('${A11_TARGET_KEY}')`;
  return `node scripts/debug/st-eval.mts "localStorage.setItem('${A11_SCALE_KEY}', '${scale}'); ${target}"`;
};

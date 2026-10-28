export const GBNF_TEMPLATE = (system: string, user: string): string => `<|turn>system\n${system}<turn|>\n<|turn>user\n${user}<turn|>\n<|turn>model\n`;
export const GBNF_TOKENS = 160;

export function gbnfRequest(system: string, user: string, grammar: string): Record<string, unknown> {
  return { prompt: GBNF_TEMPLATE(system, user), grammar, temperature: 0, top_k: 1, n_predict: GBNF_TOKENS, seed: 1, cache_prompt: false, stream: false };
}

export interface GbnfRow { id: string; kind: string; text: string | null; parsed: boolean; error?: string }
export interface GbnfCapture { format: 'so-gbnf-parity/1'; baseUrl: string; props: Record<string, unknown> | null; at: string; rows: GbnfRow[] }

export interface GbnfVerdict { cases: number; parsedA: number; parsedB: number; identical: number; missing: string[]; mismatches: Array<{ id: string; a: string | null; b: string | null }>; unparsed: Array<{ id: string; arm: 'a' | 'b' }>; pass: boolean }

export function gbnfParityVerdict(a: Pick<GbnfCapture, 'rows'>, b: Pick<GbnfCapture, 'rows'>): GbnfVerdict {
  const byId = new Map(b.rows.map((row) => [row.id, row]));
  const ids = [...new Set([...a.rows.map((row) => row.id), ...b.rows.map((row) => row.id)])];
  const verdict: GbnfVerdict = { cases: ids.length, parsedA: 0, parsedB: 0, identical: 0, missing: [], mismatches: [], unparsed: [], pass: false };
  for (const id of ids) {
    const left = a.rows.find((row) => row.id === id);
    const right = byId.get(id);
    if (!left || !right) { verdict.missing.push(id); continue; }
    if (left.parsed) verdict.parsedA += 1; else verdict.unparsed.push({ id, arm: 'a' });
    if (right.parsed) verdict.parsedB += 1; else verdict.unparsed.push({ id, arm: 'b' });
    if (left.text !== null && left.text === right.text) verdict.identical += 1;
    else verdict.mismatches.push({ id, a: left.text, b: right.text });
  }
  verdict.pass = verdict.cases > 0 && !verdict.missing.length && verdict.parsedA === verdict.cases && verdict.parsedB === verdict.cases && verdict.identical === verdict.cases;
  return verdict;
}

export const SETTLED = new Set(['complete', 'failed', 'cancelled']);
export const FAIL_FAST_MS = 60_000;

export interface RenderPoll { at: number; status: string; error?: string | null }

export type SurvivalOutcome = 'completed' | 'failed-fast' | 'failed-late' | 'hung' | 'unsettled' | 'no-event';

export interface SurvivalVerdict { outcome: SurvivalOutcome; settledAt: number | null; afterEventMs: number | null; lastStatus: string | null; pass: boolean }

export function renderSurvivalVerdict(polls: readonly RenderPoll[], eventAt: number | null, failFastMs = FAIL_FAST_MS): SurvivalVerdict {
  const settled = polls.find((poll) => SETTLED.has(poll.status)) ?? null;
  const last = polls.at(-1) ?? null;
  if (eventAt === null) return { outcome: 'no-event', settledAt: settled?.at ?? null, afterEventMs: null, lastStatus: last?.status ?? null, pass: false };
  if (settled?.status === 'complete') return { outcome: 'completed', settledAt: settled.at, afterEventMs: settled.at - eventAt, lastStatus: settled.status, pass: true };
  if (settled) {
    const after = settled.at - eventAt;
    return { outcome: after <= failFastMs ? 'failed-fast' : 'failed-late', settledAt: settled.at, afterEventMs: after, lastStatus: settled.status, pass: after <= failFastMs };
  }
  const waited = last ? last.at - eventAt : 0;
  return { outcome: waited > failFastMs ? 'hung' : 'unsettled', settledAt: null, afterEventMs: null, lastStatus: last?.status ?? null, pass: false };
}

export interface ReserveSample { at: number; fitCorrectionMiB: number; gpuReclaims: number; lastError: string | null; crashed: boolean; spill: boolean | null; phase: string | null }

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export function reserveSampleFromStatus(status: unknown, at: number): ReserveSample {
  const root = (status ?? {}) as Record<string, any>;
  const text = (root.text ?? root) as Record<string, any>;
  const spillValue = text.spill ?? root.spill ?? text.spillGuard?.spilled ?? root.spillGuard?.spilled;
  return {
    at, fitCorrectionMiB: num(text.fitCorrectionMiB), gpuReclaims: num(text.gpuReclaims), lastError: typeof text.lastError === 'string' ? text.lastError : typeof root.lastError === 'string' ? root.lastError : null,
    crashed: Boolean(text.crashed), spill: typeof spillValue === 'boolean' ? spillValue : null, phase: typeof root.phase === 'string' ? root.phase : null,
  };
}

export const RESERVE_ERROR = /409|reserve|short of|not enough|out of memory|fit/i;

export interface ReserveVerdict { samples: number; fitCorrectionMaxMiB: number; reclaims: number; spill: boolean; crashed: boolean; reserveErrors: string[]; pass: boolean; problems: string[] }

export function reserveVerdict(samples: readonly ReserveSample[]): ReserveVerdict {
  const first = samples[0];
  const errors = [...new Set(samples.map((sample) => sample.lastError).filter((error): error is string => Boolean(error) && error !== first?.lastError && RESERVE_ERROR.test(error as string)))];
  const verdict: ReserveVerdict = {
    samples: samples.length, fitCorrectionMaxMiB: Math.max(0, ...samples.map((sample) => sample.fitCorrectionMiB)), reclaims: samples.length ? (samples.at(-1) as ReserveSample).gpuReclaims - (first as ReserveSample).gpuReclaims : 0,
    spill: samples.some((sample) => sample.spill === true), crashed: samples.some((sample) => sample.crashed), reserveErrors: errors, pass: false, problems: [],
  };
  if (!samples.length) verdict.problems.push('no /status sample');
  if (verdict.fitCorrectionMaxMiB > 0) verdict.problems.push(`fitCorrection reached ${verdict.fitCorrectionMaxMiB} MiB (a --fit CPU spill correction)`);
  if (verdict.spill) verdict.problems.push('the controller reported a GPU memory spill');
  if (verdict.crashed) verdict.problems.push('the text server crashed during the window');
  if (errors.length) verdict.problems.push(`reserve errors: ${errors.join(' | ')}`);
  verdict.pass = verdict.problems.length === 0;
  return verdict;
}

export interface LatencyTurn { firstTokenMs: number; doneMs: number; replies: number; chars: number }

export const median = (values: readonly number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function turnsInRecord(record: unknown): LatencyTurn[] {
  const steps = ((record ?? {}) as { steps?: Array<{ output?: unknown }>; result?: { steps?: Array<{ output?: unknown }> } });
  const list = steps.steps ?? steps.result?.steps ?? [];
  const kept = list.map((step) => step.output as { turns?: unknown } | undefined).find((output) => Array.isArray(output?.turns));
  return (kept?.turns ?? []) as LatencyTurn[];
}

export interface LatencyVerdict { boundMs: number; off: { turns: number; firstTokenP50: number | null; doneP50: number | null }; on: { turns: number; firstTokenP50: number | null; doneP50: number | null }; firstTokenDeltaMs: number | null; pass: boolean; problems: string[] }

export function sendLatencyVerdict(off: readonly LatencyTurn[], on: readonly LatencyTurn[], boundMs: number | null): LatencyVerdict {
  if (boundMs === null || !Number.isFinite(boundMs) || boundMs < 0) throw new Error('refused: a latency floor is predeclared (--bound-ms), never chosen after the run');
  const arm = (turns: readonly LatencyTurn[]) => ({ turns: turns.length, firstTokenP50: median(turns.map((turn) => turn.firstTokenMs)), doneP50: median(turns.map((turn) => turn.doneMs)) });
  const verdict: LatencyVerdict = { boundMs, off: arm(off), on: arm(on), firstTokenDeltaMs: null, pass: false, problems: [] };
  if (!off.length || !on.length) verdict.problems.push('an arm has no measured turn (vacuous)');
  if (off.length !== on.length) verdict.problems.push(`unbalanced arms: ${off.length} off, ${on.length} on`);
  if (verdict.on.firstTokenP50 !== null && verdict.off.firstTokenP50 !== null) {
    verdict.firstTokenDeltaMs = verdict.on.firstTokenP50 - verdict.off.firstTokenP50;
    if (verdict.firstTokenDeltaMs > boundMs) verdict.problems.push(`first token p50 rose ${verdict.firstTokenDeltaMs} ms with prefill on (bound ${boundMs} ms)`);
  }
  verdict.pass = verdict.problems.length === 0;
  return verdict;
}

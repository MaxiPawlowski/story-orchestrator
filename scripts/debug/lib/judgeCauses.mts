import { WARDEN_CALLS_PER_TIMEOUT, WARDEN_MIN_CALLS, WARDEN_TIMEOUT_MS, dedupe, type TimeoutEvent } from './judgeTimeouts.mts';
import { percentile, type B1Verdict } from './b1Runs.mts';

export const C3_USES = ['warden', 'wardenLore'] as const;
export type C3Use = (typeof C3_USES)[number];
export const MATCH_WINDOW_MS = 1500;
export const C3_FLOOR_TEXT = 'formal `so-judge timeouts` per run; floor 1 timeout in 50 per use, never retuned (v2.8 01 C3; J2 bar)';
export const CAUSES = ['hold', 'queue', 'provider', 'unattributed'] as const;
export type Cause = (typeof CAUSES)[number];
export const LORE_SELECT_USE = 'lore';

export interface StatusSample {
  at: number;
  ok: boolean;
  adaptive?: Record<string, { factor?: number; coolingMs?: number; busyAnswers?: number }> | null;
  refusals?: { local?: number; upstreamRefused?: number; lastUpstream?: { at?: string; retryAfter?: string | null; status?: number } | null } | null;
  served?: { total?: number; byUse?: Record<string, number> } | null;
  error?: string;
}

export interface RecordedCall {
  seq: number;
  epoch?: number;
  use: string;
  startedAt: number;
  endedAt: number | null;
  ms: number | null;
  status: number | null;
  retryAfter: string | null;
  outcome: 'answered' | 'aborted' | 'error' | null;
  before: StatusSample | null;
  after: StatusSample | null;
}

export const rawUse = (event: TimeoutEvent): string => (event.wardenLore ? 'wardenLore' : event.use);

export const RECORDER_SOURCE = `(base) => {
  const g = globalThis;
  if (g.__soJudgeCauses?.installed) return { installed: true, already: true, epoch: g.__soJudgeCauses.epoch, seq: g.__soJudgeCauses.seq };
  const state = { installed: true, epoch: Date.now(), seq: 0, rows: [], cap: 4000, drained: 0 };
  const original = g.fetch.bind(g);
  const sample = async () => {
    const at = Date.now();
    try {
      const response = await original(base + '/status', { headers: SillyTavern.getContext().getRequestHeaders() });
      const body = response.ok ? await response.json() : null;
      return { at, ok: response.ok, adaptive: body?.adaptive ?? null, refusals: body?.refusals ?? null, served: body?.served ? { total: body.served.total, byUse: body.served.byUse } : null };
    } catch (error) {
      return { at, ok: false, error: String(error?.message ?? error).slice(0, 120) };
    }
  };
  g.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : String(input?.url ?? '');
    if (!url.includes(base + '/systemone') && !url.includes(base + '/providers/')) return original(input, init);
    const headers = init?.headers ?? {};
    const use = String(headers['X-SO-Judge-Use'] ?? headers['x-so-judge-use'] ?? 'unlabelled');
    const row = { seq: ++state.seq, epoch: state.epoch, use, startedAt: Date.now(), endedAt: null, ms: null, status: null, retryAfter: null, outcome: null, before: null, after: null };
    state.rows.push(row);
    if (state.rows.length > state.cap) state.rows.shift();
    sample().then((value) => { row.before = value; });
    const settle = (outcome, response) => {
      row.endedAt = Date.now();
      row.ms = row.endedAt - row.startedAt;
      row.outcome = outcome;
      if (response) { row.status = response.status; row.retryAfter = response.headers.get('Retry-After'); }
      sample().then((value) => { row.after = value; });
    };
    const pending = original(input, init);
    pending.then((response) => settle('answered', response), (error) => settle(error?.name === 'AbortError' ? 'aborted' : 'error', null));
    return pending;
  };
  g.__soJudgeCauses = state;
  return { installed: true, already: false, epoch: state.epoch, seq: 0 };
}`;

export function matchCall(event: TimeoutEvent, calls: RecordedCall[]): RecordedCall | null {
  const end = Date.parse(event.at);
  const use = rawUse(event);
  const near = calls
    .filter((call) => call.use === use && call.endedAt !== null && call.outcome !== 'answered' && Math.abs((call.endedAt as number) - end) <= MATCH_WINDOW_MS)
    .sort((left, right) => Math.abs((left.endedAt as number) - end) - Math.abs((right.endedAt as number) - end));
  return near[0] ?? null;
}

const servedOf = (sample: StatusSample | null, use: string): number | null => {
  const value = sample?.served?.byUse?.[use];
  return typeof value === 'number' ? value : sample?.served ? 0 : null;
};

const heldDuring = (call: RecordedCall): boolean => {
  const cooling = Object.values(call.before?.adaptive ?? {}).some((state) => (state?.coolingMs ?? 0) > 0);
  const last = call.after?.refusals?.lastUpstream;
  const lastAt = last?.at ? Date.parse(last.at) : Number.NaN;
  const upstreamHold = Boolean(last?.retryAfter) && Number.isFinite(lastAt) && lastAt >= call.startedAt && lastAt <= (call.endedAt ?? call.startedAt);
  const refused = (call.after?.refusals?.local ?? 0) > (call.before?.refusals?.local ?? 0);
  return cooling || upstreamHold || refused || Boolean(call.retryAfter);
};

export function attribute(call: RecordedCall | null, calls: RecordedCall[]): { cause: Cause; why: string } {
  if (!call) return { cause: 'unattributed', why: 'no recorded call of this use ended within 1.5 s of the timeout' };
  if (!call.before?.ok || !call.after?.ok) return { cause: 'unattributed', why: 'a /status sample around the call is missing or failed' };
  if (heldDuring(call)) return { cause: 'hold', why: 'the plugin was cooling, refused, or passed a Retry-After while the call was open (lane / account hold)' };
  const before = servedOf(call.before, call.use);
  const after = servedOf(call.after, call.use);
  if (before === null || after === null) return { cause: 'unattributed', why: 'the /status samples carry no per-use served count' };
  const started = calls.filter((other) => other.use === call.use && other.startedAt >= call.before!.at && other.startedAt <= (call.endedAt ?? call.startedAt)).length || 1;
  const served = after - before;
  if (served <= 0) return { cause: 'queue', why: 'the plugin had not passed the call to the provider when the budget ran out (served count unchanged)' };
  if (served >= started) return { cause: 'provider', why: 'the plugin passed every call of this use to the provider; the provider had not answered within the budget' };
  return { cause: 'unattributed', why: `${served} of ${started} overlapping calls of this use were served: the samples cannot say which` };
}

const sent = (event: TimeoutEvent) => !event.cached && !['unavailable', 'invalid', 'disabled', 'no-roles', 'no-seam', 'uncalibrated'].includes(event.fallback ?? '');

export function useTable(events: TimeoutEvent[], calls: RecordedCall[], use: C3Use) {
  const mine = dedupe(events).filter((event) => rawUse(event) === use && sent(event));
  const ok = mine.filter((event) => !event.fallback).map((event) => event.latencyMs);
  const timeouts = mine.filter((event) => event.fallback === 'timeout').map((event) => {
    const call = matchCall(event, calls);
    const { cause, why } = attribute(call, calls);
    return { at: event.at, clientWaitMs: event.latencyMs, budgetMs: WARDEN_TIMEOUT_MS, budgetHit: event.latencyMs >= WARDEN_TIMEOUT_MS - 50, recordedMs: call?.ms ?? null, cause, why };
  });
  const byCause = Object.fromEntries(CAUSES.map((cause) => [cause, timeouts.filter((row) => row.cause === cause).length]));
  const measured = mine.length >= WARDEN_MIN_CALLS;
  const ok50 = timeouts.length * WARDEN_CALLS_PER_TIMEOUT <= mine.length;
  const verdict: B1Verdict = !measured ? 'INCOMPLETE' : ok50 ? 'PASS' : 'FAIL';
  return {
    use, calls: mine.length, timeouts: timeouts.length, verdict, rule: `<= 1 timeout per ${WARDEN_CALLS_PER_TIMEOUT} calls over >= ${WARDEN_MIN_CALLS}`,
    byCause, providerLatencyMs: { p50: percentile(ok, 0.5), p95: percentile(ok, 0.95), n: ok.length }, recorded: calls.filter((call) => call.use === use).length, timeoutRows: timeouts,
  };
}

export function scoreC3(events: TimeoutEvent[], calls: RecordedCall[], turns: unknown[] = []) {
  const tables = C3_USES.map((use) => useTable(events, calls, use));
  const totals = turns.filter((row): row is Record<string, any> => Boolean(row) && (row as { kind?: unknown }).kind === 'turn' && (row as { ok?: unknown }).ok !== false).map((row) => Number(row.timing?.totalMs)).filter(Number.isFinite);
  const incomplete = [
    ...tables.filter((table) => table.verdict === 'INCOMPLETE').map((table) => `${table.use}: ${table.calls} call(s), the floor needs >= ${WARDEN_MIN_CALLS}`),
    ...(!calls.length ? ['no recorded calls: arm the recorder (so-b1-judge-causes.mts follow) before the play'] : []),
  ];
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : tables.every((table) => table.verdict === 'PASS') ? 'PASS' : 'FAIL';
  return {
    floor: C3_FLOOR_TEXT, verdict, incomplete,
    uses: tables.map(({ timeoutRows, ...rest }) => ({ ...rest, timeoutRows: timeoutRows.map(({ at: _at, ...row }) => row) })),
    unattributed: tables.reduce((sum, table) => sum + table.byCause.unattributed, 0),
    r4LatencyWithWardenLore: { turns: totals.length, p50: percentile(totals, 0.5), p95: percentile(totals, 0.95), source: 'turns.jsonl timing.totalMs, a turn = send to settled round' },
  };
}

export function loreSelectPerTurn(events: TimeoutEvent[], turns: unknown[]) {
  const rows = turns.filter((row): row is Record<string, any> => Boolean(row) && (row as { kind?: unknown }).kind === 'turn' && Array.isArray((row as { replies?: unknown }).replies) && (row as { replies: unknown[] }).replies.length > 0);
  const lore = dedupe(events).filter((event) => event.use === LORE_SELECT_USE && !event.cached);
  const ranges = rows.map((row) => {
    const ids = row.replies.map((reply) => Number(reply.messageId)).filter(Number.isFinite);
    return { chatId: row.chatId ?? null, from: Math.min(...ids) - 1, to: Math.max(...ids) - 1 };
  });
  const counts = ranges.map((range) => lore.filter((event) => (range.chatId === null || event.chatId === null || event.chatId === range.chatId) && event.messageId >= range.from && event.messageId <= range.to).length);
  const counted = counts.reduce((sum, value) => sum + value, 0);
  return {
    floor: 'record only', verdict: (rows.length ? 'RECORDED' : 'INCOMPLETE') as B1Verdict,
    incomplete: rows.length ? [] : ['no loud turn with a reply in turns.jsonl'],
    turns: rows.length, requests: counted, outsideTurns: lore.length - counted,
    perTurn: { p50: percentile(counts, 0.5), p95: percentile(counts, 0.95), max: counts.length ? Math.max(...counts) : null, zeroTurns: counts.filter((value) => value === 0).length },
    source: 'extras.judge.calls (use lore) grouped by the loud turns of turns.jsonl: a call belongs to the turn whose replies it preceded',
  };
}

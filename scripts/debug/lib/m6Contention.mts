export interface ModelCallRow { kind: 'call'; id: number; epoch: string; t0: number; t1: number | null; profileId: string | null; ok: boolean | null; errorName?: string | null; errorMessage?: string | null; abortReason?: string | null }
export interface GenerationRow { kind: 'generation'; id: number; epoch: string; t0: number; t1: number | null; type: string | null; dry: boolean }
export type M6Row = ModelCallRow | GenerationRow;

export type CallOutcome = 'ok' | 'rate-limit' | 'timeout' | 'lapse' | 'error' | 'open';

export const M6_FLOORS = { rateLimited: 1, coincidentTimeouts: 3 } as const;

const RATE_LIMIT = /\b429\b|too many requests|rate[ -]?limit|quota/i;
const TIMEOUT = /timed? ?out|did not answer within|TimeoutError/i;

export function classifyCall(row: ModelCallRow): CallOutcome {
  if (row.ok === null || row.t1 === null) return 'open';
  if (row.ok) return 'ok';
  const text = `${row.errorName ?? ''} ${row.errorMessage ?? ''} ${row.abortReason ?? ''}`;
  if (RATE_LIMIT.test(text)) return 'rate-limit';
  if (TIMEOUT.test(text)) return 'timeout';
  if (/abort/i.test(text)) return 'lapse';
  return 'error';
}

const overlaps = (a: { t0: number; t1: number | null }, b: { t0: number; t1: number | null }, now: number) => a.t0 < (b.t1 ?? now) && b.t0 < (a.t1 ?? now);

export interface M6Summary {
  calls: number;
  outcomes: Record<CallOutcome, number>;
  mainGenerations: number;
  rateLimited: number;
  timeouts: number;
  coincidentTimeouts: number;
  coincident: Array<{ call: number; generation: number; profileId: string | null }>;
  opens: { rpmSpacing: boolean; mutexDeferral: boolean };
}

export function summarizeM6(rows: readonly M6Row[], now = Date.now()): M6Summary {
  const calls = rows.filter((row): row is ModelCallRow => row.kind === 'call');
  const generations = rows.filter((row): row is GenerationRow => row.kind === 'generation' && !row.dry);
  const outcomes: Record<CallOutcome, number> = { ok: 0, 'rate-limit': 0, timeout: 0, lapse: 0, error: 0, open: 0 };
  const coincident: M6Summary['coincident'] = [];
  for (const call of calls) {
    const outcome = classifyCall(call);
    outcomes[outcome] += 1;
    if (outcome !== 'timeout') continue;
    const generation = generations.find((entry) => entry.epoch === call.epoch && overlaps(call, entry, now));
    if (generation) coincident.push({ call: call.id, generation: generation.id, profileId: call.profileId });
  }
  return {
    calls: calls.length,
    outcomes,
    mainGenerations: generations.length,
    rateLimited: outcomes['rate-limit'],
    timeouts: outcomes.timeout,
    coincidentTimeouts: coincident.length,
    coincident,
    opens: { rpmSpacing: outcomes['rate-limit'] >= M6_FLOORS.rateLimited, mutexDeferral: coincident.length >= M6_FLOORS.coincidentTimeouts },
  };
}

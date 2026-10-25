import { isPlumbingError } from './stopRule.mts';

export type JourneyStop = { stopped: 'S5'; verdict: 'not-a-measurement'; at: string; reason: string; counts: { items: number; planned: number; outcomes: Record<string, number> } };

export const retriesAsPlumbing = (outcome: { ok: boolean; error?: string | null }, noStop: boolean): boolean => !noStop && !outcome.ok && isPlumbingError(outcome.error);

export function journeyS5(checkId: string, index: number, planned: number, error: string, results: ReadonlyArray<{ outcome: string }>): JourneyStop {
  const outcomes = results.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.outcome]: (acc[row.outcome] ?? 0) + 1 }), {});
  return { stopped: 'S5', verdict: 'not-a-measurement', at: `${index + 1}/${planned}`, reason: `${checkId}: harness error after one retry: ${error}`, counts: { items: index + 1, planned, outcomes } };
}

export const stoppedRow = (summary: Record<string, unknown>, stop: JourneyStop) => ({ ...summary, outcome: 'not-runnable', detail: `stopped ${stop.stopped} at ${stop.at} (harness defect, remaining checks not run)` });

import { classOf, noModelRunnable } from './modelClass.mts';

export const NOMODEL_LANES = [30, 31, 32, 33, 34];

export interface ScenarioRow {
  path: string;
  shape?: { needsLlm?: boolean } | null;
  requires?: { lane?: string; prior?: string } | null;
  decision?: string;
  reason?: string;
}

export interface SuiteList {
  scenarios: string[];
  journeys: Array<{ id: string; checks: string[] }>;
  left: string[];
  problems: string[];
}

export function noModelScenarios(rows: ScenarioRow[], modelOf: (path: string) => unknown, noModelOf: (rows: ScenarioRow[]) => ScenarioRow[]): { scenarios: string[]; left: string[]; problems: string[] } {
  const listed = noModelOf(rows.filter((row) => row.shape && !row.shape.needsLlm && row.decision === 'keep'));
  const problems = listed.filter((row) => modelOf(row.path) !== 'none').map((row) => `${row.path}: on the no-LLM no-model list but declares model ${String(modelOf(row.path))}`);
  const scenarios = listed.filter((row) => modelOf(row.path) === 'none').map((row) => row.path).sort();
  const left = rows
    .filter((row) => row.requires?.lane === 'no-model' && !scenarios.includes(row.path))
    .map((row) => `${row.path}: ${row.requires?.prior ? `needs a prior step (${row.requires.prior})` : `decision ${row.decision ?? 'none'}${row.reason ? ` (${row.reason})` : ''}`}`)
    .sort();
  return { scenarios, left, problems };
}

export function noModelJourneys(journeys: Array<{ id: string; status?: string; checks?: Array<{ id: string; model?: unknown; mode?: string; dependsOn?: unknown }> }>): Array<{ id: string; checks: string[] }> {
  return journeys
    .filter((journey) => (journey.status ?? 'active') !== 'reserved' && /^(J|GS)\d+$/i.test(journey.id))
    .map((journey) => ({ id: journey.id, checks: noModelRunnable(journey.checks ?? []) }))
    .filter((journey) => journey.checks.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export const noneChecks = (checks: Array<{ model?: unknown; mode?: string }>) => checks.filter((check) => check.mode !== 'human' && classOf(check) === 'none').length;

export interface LaneStatus { lane: number; seeded?: boolean; serverUp?: boolean; noModel?: boolean; refused?: string; browser?: boolean }

export function laneProblems(status: LaneStatus[], lanes: number[]): string[] {
  const problems: string[] = [];
  for (const n of lanes) {
    const row = status.find((entry) => entry.lane === n);
    if (!row) { problems.push(`lane ${n}: not listed by st-lanes status`); continue; }
    if (row.refused) problems.push(`lane ${n}: refused (${row.refused})`);
    if (!row.seeded) problems.push(`lane ${n}: not seeded (st-lanes.mts seed ${n})`);
    if (!row.noModel) problems.push(`lane ${n}: has a model; make it a no-model lane first (st-lanes.mts stop ${n}; st-lanes.mts no-model ${n}; st-lanes.mts start ${n})`);
    if (!row.serverUp) problems.push(`lane ${n}: server not up (st-lanes.mts start ${n})`);
  }
  return problems;
}

export interface BatchRow { item: string; lane: number; run: number; status: string; notRunnable?: string | null; failures?: string[]; automated?: string | null; evidence?: { problems?: string[] } ; ms?: number }

export function summarizeBatch(results: BatchRow[]): { counts: Record<string, number>; lines: string[]; ok: boolean } {
  const counts: Record<string, number> = { GREEN: 0, RED: 0, INCOMPLETE: 0, 'NOT-RUNNABLE': 0 };
  const lines: string[] = [];
  for (const row of results) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    if (row.status === 'GREEN') continue;
    const why = row.status === 'NOT-RUNNABLE' ? row.notRunnable : row.status === 'INCOMPLETE' ? (row.evidence?.problems ?? []).join('; ') : [row.automated, ...(row.failures ?? [])].filter(Boolean).join('; ');
    lines.push(`${row.status.padEnd(12)} ${row.item} (lane ${row.lane})${why ? `: ${why}` : ''}`);
  }
  return { counts, lines, ok: results.length > 0 && counts.GREEN === results.length };
}

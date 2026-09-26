export interface HoldoutScore { valid: boolean; shape: boolean }

export interface HoldoutRecord { id: string; score: HoldoutScore }

export interface HoldoutSummary {
  cases: number;
  validity: { passed: number; total: number };
  opShape: { passed: number; total: number };
  misses: string[];
}

export interface RoleRun {
  bundle: string;
  meetsFloors: boolean | null;
  holdout: HoldoutSummary | null;
}

export type RoleVerdict =
  | { verdict: 'incomplete'; reason: string }
  | { verdict: 'not recommended'; reason: string }
  | { verdict: 'fixture floors met; generalisation not shown'; reason: string }
  | { verdict: 'recommended'; reason: string };

export function summarizeHoldout(records: HoldoutRecord[]): HoldoutSummary {
  return {
    cases: records.length,
    validity: { passed: records.filter((record) => record.score.valid).length, total: records.length },
    opShape: { passed: records.filter((record) => record.score.shape).length, total: records.length },
    misses: records.filter((record) => !record.score.valid || !record.score.shape).map((record) => record.id),
  };
}

export function roleVerdict(runs: RoleRun[], options: { holdoutRequired: boolean }): RoleVerdict {
  if (runs.length !== 2) return { verdict: 'incomplete', reason: `${runs.length} run(s); a verdict needs exactly 2 consecutive runs` };
  const bundles = [...new Set(runs.map((run) => run.bundle))];
  if (bundles.length !== 1) return { verdict: 'incomplete', reason: `runs span bundles ${bundles.join(', ')}; both runs must be one bundle` };
  const missed = runs.map((run, index) => ({ run: index + 1, meets: run.meetsFloors })).filter((entry) => entry.meets !== true);
  if (missed.length) return { verdict: 'not recommended', reason: `run ${missed.map((entry) => entry.run).join(' and ')} below a floor` };
  if (options.holdoutRequired && runs.some((run) => !run.holdout)) return { verdict: 'incomplete', reason: 'a run carries no hold-out score' };
  const misses = runs.flatMap((run, index) => (run.holdout?.misses ?? []).map((id) => `run ${index + 1}: ${id}`));
  if (misses.length) return { verdict: 'fixture floors met; generalisation not shown', reason: `hold-out miss ${misses.join(', ')}` };
  return { verdict: 'recommended', reason: 'both runs meet every floor' + (options.holdoutRequired ? ' and every hold-out row' : '') };
}

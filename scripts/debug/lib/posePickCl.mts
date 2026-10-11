import { imageExtensionOff, mediaOff } from './adolionFresh.mts';

export const POSE_PICK_FLOOR = 0.8;
export const JUDGE_CALL_BUDGET = 300;
export const FIXTURE_SIZE = 40;
export const NEVER_SENT = new Set(['unavailable', 'invalid', 'disabled', 'no-roles', 'no-seam', 'busy']);

export type PickSource = 'judge' | 'llm' | 'none';
export type PickRow = { id: string; label: string | null; picked: string | null; source: PickSource };
export type JudgeResultRow = { cached: boolean; fallback: string | null; model: string | null; latencyMs: number; answered: boolean };

export interface FixtureReply { id: string; member: string; text: string; pose: string | null }

const NONE = 'none';

export function readFixture(value: unknown): FixtureReply[] {
  if (!Array.isArray(value)) throw new Error('the fixture is not a list');
  const rows = value.map((row, at) => {
    const entry = row as Record<string, unknown>;
    if (typeof entry?.id !== 'string' || typeof entry.member !== 'string' || typeof entry.text !== 'string') throw new Error(`fixture row ${at} lacks id, member or text`);
    if (entry.pose !== null && typeof entry.pose !== 'string') throw new Error(`fixture row ${entry.id} has a pose that is neither an id nor null`);
    return { id: entry.id, member: entry.member, text: entry.text, pose: entry.pose as string | null };
  });
  if (rows.length !== FIXTURE_SIZE) throw new Error(`the fixture holds ${rows.length} replies, not ${FIXTURE_SIZE}`);
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('the fixture repeats an id');
  return rows;
}

export interface LegScore { answered: number; correct: number; accuracy: number | null }

const leg = (rows: readonly PickRow[], source: PickSource): LegScore => {
  const own = rows.filter((row) => row.source === source);
  const correct = own.filter((row) => row.picked === row.label).length;
  return { answered: own.length, correct, accuracy: own.length ? correct / own.length : null };
};

export function scoreRun(rows: readonly PickRow[]) {
  const total = rows.length;
  const correct = rows.filter((row) => row.picked === row.label).length;
  const accuracy = total ? correct / total : 0;
  const confusions = new Map<string, number>();
  for (const row of rows) if (row.picked !== row.label) {
    const key = `${row.label ?? NONE} -> ${row.picked ?? NONE}`;
    confusions.set(key, (confusions.get(key) ?? 0) + 1);
  }
  return {
    total, correct, accuracy, floor: POSE_PICK_FLOOR, meetsFloor: accuracy >= POSE_PICK_FLOOR, complete: total === FIXTURE_SIZE && new Set(rows.map((row) => row.id)).size === total,
    legs: { judge: leg(rows, 'judge'), llm: leg(rows, 'llm'), none: leg(rows, 'none') },
    labelledNone: { total: rows.filter((row) => row.label === null).length, correct: rows.filter((row) => row.label === null && row.picked === null).length },
    confusions: [...confusions].map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair)),
  };
}

export function tallyJudge(results: readonly JudgeResultRow[]) {
  const fallbacks: Record<string, number> = {};
  for (const result of results) if (result.fallback) fallbacks[result.fallback] = (fallbacks[result.fallback] ?? 0) + 1;
  const cached = results.filter((result) => result.cached).length;
  const sent = results.filter((result) => !result.cached && !(result.fallback && NEVER_SENT.has(result.fallback))).length;
  const answered = results.filter((result) => result.answered).length;
  const latencies = results.filter((result) => !result.cached && result.answered).map((result) => result.latencyMs).sort((a, b) => a - b);
  return {
    asked: results.length, sent, cached, answered, fallbacks, models: [...new Set(results.flatMap((result) => (result.model ? [result.model] : [])))].sort(),
    medianLatencyMs: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
  };
}

export function judgeBudget(runs: readonly { sent: number }[], budget = JUDGE_CALL_BUDGET) {
  const sent = runs.reduce((sum, run) => sum + run.sent, 0);
  return { sent, budget, within: sent <= budget };
}

export function lanePrepare(settings: Record<string, any>) {
  const root = (settings.extension_settings ??= {});
  const ours = (root['story-orchestrator'] ??= {});
  const was = mediaOff(ours);
  const extension = imageExtensionOff(settings);
  return { was, extension };
}

export function lanePrepareProblems(settings: Record<string, any>): string[] {
  const ours = settings.extension_settings?.['story-orchestrator']?.settings ?? {};
  const problems: string[] = [];
  if (ours.image?.enabled !== false) problems.push('image.enabled is not false');
  if (ours.sprites?.enabled !== false) problems.push('sprites.enabled is not false');
  const disabled = settings.extension_settings?.disabledExtensions;
  if (!Array.isArray(disabled) || !disabled.includes('stable-diffusion')) problems.push('the Image Generation extension is not disabled');
  return problems;
}

export function runRecordName(arm: string, run: number): string {
  return `run${run}-${arm}.json`;
}

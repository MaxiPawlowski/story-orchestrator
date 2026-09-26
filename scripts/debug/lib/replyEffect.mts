// v2.5 plan 06 J3: does a warden note change the NEXT reply? Two runs per arm, one rescore output per
// record (so-judge rescore --use agency|house-rules --records <one record>). The bars are the plan's
// predeclared ones: >= 20 answered replies per run, each off run's defect rate >= 0.2 (else the arm
// did not induce the defect and the measurement is void), and each on run <= the pooled off rate - 0.15.

import { createHash } from 'node:crypto';

export const MIN_REPLIES = 20;
export const OFF_VALIDITY = 0.2;
export const EFFECT_FLOOR = 0.15;

export interface EffectRun { arm: 'on' | 'off'; file: string; answered: number; flagged: number }

export type ReplyEffectVerdict = {
  verdict: 'reduces' | 'flags reliably; no effect on replies shown' | 'void' | 'incomplete';
  reason: string;
  offRate: number | null;
  onRates: number[];
};

const rate = (run: EffectRun) => (run.answered ? run.flagged / run.answered : 0);
const round = (value: number) => Number(value.toFixed(4));

export function runFromRescore(output, file: string): EffectRun {
  const rates = output?.summary?.rates ?? [];
  if (rates.length !== 1) throw new Error(`${file}: expected one arm per rescore (rescore one record at a time), got ${rates.length}`);
  const [row] = rates;
  if (row.arm !== 'on' && row.arm !== 'off') throw new Error(`${file}: arm '${row.arm}' is neither on nor off`);
  return { arm: row.arm, file, answered: row.answered, flagged: row.flagged };
}

export function replyEffectVerdict(runs: EffectRun[]): ReplyEffectVerdict {
  const off = runs.filter((run) => run.arm === 'off');
  const on = runs.filter((run) => run.arm === 'on');
  const empty = { offRate: null, onRates: [] };
  if (off.length !== 2 || on.length !== 2) return { verdict: 'incomplete', reason: `${on.length} on and ${off.length} off run(s); the plan needs 2 of each`, ...empty };
  const short = runs.filter((run) => run.answered < MIN_REPLIES);
  if (short.length) return { verdict: 'incomplete', reason: `under ${MIN_REPLIES} answered replies: ${short.map((run) => `${run.file} (${run.answered})`).join(', ')}`, ...empty };
  const offRate = round(off.reduce((sum, run) => sum + run.flagged, 0) / off.reduce((sum, run) => sum + run.answered, 0));
  const onRates = on.map((run) => round(rate(run)));
  const weak = off.filter((run) => rate(run) < OFF_VALIDITY);
  if (weak.length) return { verdict: 'void', reason: `off run(s) under ${OFF_VALIDITY}: ${weak.map((run) => `${run.file} ${round(rate(run))}`).join(', ')}; the arm did not induce the defect`, offRate, onRates };
  const bar = round(offRate - EFFECT_FLOOR);
  const met = onRates.every((value) => value <= bar + 1e-9);
  return met
    ? { verdict: 'reduces', reason: `both on runs (${onRates.join(', ')}) <= ${bar} (pooled off ${offRate} - ${EFFECT_FLOOR})`, offRate, onRates }
    : { verdict: 'flags reliably; no effect on replies shown', reason: `on runs ${onRates.join(', ')} against the bar ${bar} (pooled off ${offRate} - ${EFFECT_FLOOR})`, offRate, onRates };
}

export interface SampleRow { id: string; arm: string; file: string; text: string }

const rank = (seed: string, row: SampleRow) => createHash('sha256').update(`${seed}|${row.file}|${row.id}`).digest('hex');

export function blindSample(rows: SampleRow[], perArm: number, seed: string) {
  const arms = [...new Set(rows.map((row) => row.arm))].sort();
  const picked = arms.flatMap((arm) => rows.filter((row) => row.arm === arm).sort((left, right) => rank(seed, left).localeCompare(rank(seed, right))).slice(0, perArm));
  const shuffled = [...picked].sort((left, right) => rank(`${seed}#order`, left).localeCompare(rank(`${seed}#order`, right)));
  const blind = shuffled.map((row, index) => ({ row, blindId: `b${String(index + 1).padStart(2, '0')}` }));
  return {
    sheet: blind.map(({ row, blindId }) => ({ blindId, text: row.text, defect: null as boolean | null })),
    key: blind.map(({ row, blindId }) => ({ blindId, arm: row.arm, file: row.file, id: row.id })),
  };
}

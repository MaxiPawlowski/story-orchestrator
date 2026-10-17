import { compareFingerprints, type MeasurementFingerprints } from './measurementFingerprint.mts';

export type ArmState = 'stable-pass' | 'stable-fail' | 'flaky' | 'missing';
export type ArmChange = 'regressed' | 'improved' | 'unchanged' | 'flaky' | 'new' | 'removed';

export interface ArmReport {
  arm?: string;
  fingerprints?: Partial<MeasurementFingerprints>;
  results: Array<{ name: string; pass: boolean; error?: string; tiers?: Array<{ tier: string; pass: boolean }> }>;
}

export interface CompareRow { key: string; a: ArmState; b: ArmState; change: ArmChange }

const outcomes = (report: ArmReport): Map<string, boolean> => {
  const out = new Map<string, boolean>();
  for (const result of report.results ?? []) {
    out.set(result.name, result.pass && !result.error);
    for (const tier of result.tiers ?? []) out.set(`${result.name}:${tier.tier}`, tier.pass);
  }
  return out;
};

export const armState = (r1: boolean | undefined, r2: boolean | undefined): ArmState => {
  if (r1 === undefined || r2 === undefined) return 'missing';
  if (r1 !== r2) return 'flaky';
  return r1 ? 'stable-pass' : 'stable-fail';
};

export const changeOf = (a: ArmState, b: ArmState): ArmChange => {
  if (a === 'missing' && b !== 'missing') return 'new';
  if (b === 'missing') return 'removed';
  if (a === 'stable-pass' && b === 'stable-fail') return 'regressed';
  if (a === 'stable-fail' && b === 'stable-pass') return 'improved';
  if (a === 'flaky' || b === 'flaky') return 'flaky';
  return 'unchanged';
};

const NOTE = 'two repetitions support "observed stable" or "observed flaky", nothing stronger';

export function compareArms(a1: ArmReport, a2: ArmReport, b1: ArmReport, b2: ArmReport, declared: readonly string[] = []) {
  const [oa1, oa2, ob1, ob2] = [a1, a2, b1, b2].map(outcomes);
  const keys = [...new Set([...oa1.keys(), ...oa2.keys(), ...ob1.keys(), ...ob2.keys()])].sort();
  const rows: CompareRow[] = keys.map((key) => {
    const a = armState(oa1.get(key), oa2.get(key));
    const b = armState(ob1.get(key), ob2.get(key));
    return { key, a, b, change: changeOf(a, b) };
  });
  const empty: Record<ArmChange, number> = { regressed: 0, improved: 0, unchanged: 0, flaky: 0, new: 0, removed: 0 };
  const counts = rows.reduce<Record<ArmChange, number>>((sum, row) => ({ ...sum, [row.change]: sum[row.change] + 1 }), empty);
  const repeats = { a: compareFingerprints(a1.fingerprints, a2.fingerprints), b: compareFingerprints(b1.fingerprints, b2.fingerprints) };
  const across = compareFingerprints(a1.fingerprints, b1.fingerprints, declared);
  const acrossLabel = across.missing ? 'a report carries no fingerprints' : `fingerprints differ (${across.differs.join(', ')})`;
  const label = !repeats.a.comparable || !repeats.b.comparable ? "not comparable: an arm's two runs differ in fingerprints"
    : !across.comparable ? `not comparable: ${acrossLabel}` : 'comparable';
  return { label, comparable: label === 'comparable', declared: [...declared], fingerprints: { repeats, across }, counts, rows, note: NOTE };
}

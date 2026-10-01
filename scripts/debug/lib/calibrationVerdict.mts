// V18: `calibrate` documented "exit 1 below --min", but a fixture with family floors was judged by
// its families alone, so the typed read reported ok at an overall rate of 0.83 against the 0.85 plan
// 02 declared. Family floors still decide by default; an EXPLICIT --min binds the overall rate too,
// so a caller who asks for a floor gets that floor.
//
// v2.4 plan 07 T25: the model check is a verdict, not strict equality. `resolved` (a floating alias
// answered by a versioned id) passes and records what it resolved to; `mismatch` fails; `unknown`
// (nothing answered with a model) fails too, because an unmeasured model is never a match.

export type ModelVerdict = 'matched' | 'resolved' | 'mismatch' | 'unknown';

export interface CalibrationVerdictInput {
  rate: number;
  min: number;
  minGiven: boolean;
  families: Array<{ ok: boolean }>;
  modelVerdict: ModelVerdict | null;
}

export function calibrationOk({ rate, min, minGiven, families, modelVerdict }: CalibrationVerdictInput): boolean {
  if (modelVerdict === 'mismatch' || modelVerdict === 'unknown') return false;
  if (!families.length) return rate >= min;
  return families.every((family) => family.ok) && (!minGiven || rate >= min);
}

export const JUDGE_CLI_PROVIDERS = ['typesafe', 'llama-logprob'] as const;
export type JudgeCliProvider = (typeof JUDGE_CLI_PROVIDERS)[number];

export function readJudgeProvider(value: string | undefined): JudgeCliProvider {
  if (value === undefined || value === '') return 'typesafe';
  if (!(JUDGE_CLI_PROVIDERS as readonly string[]).includes(value)) throw new Error(`unknown judge provider '${value}' (known: ${JUDGE_CLI_PROVIDERS.join(', ')})`);
  return value as JudgeCliProvider;
}

export function providerVerdict(provider: JudgeCliProvider, typesafe: { verdict: ModelVerdict; resolvedTo?: string }, answered: string | null): { verdict: ModelVerdict; resolvedTo?: string } {
  if (provider === 'typesafe') return typesafe;
  return answered ? { verdict: 'resolved', resolvedTo: answered } : { verdict: 'unknown' };
}

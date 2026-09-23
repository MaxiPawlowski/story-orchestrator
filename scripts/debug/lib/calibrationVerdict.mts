// V18: `calibrate` documented "exit 1 below --min", but a fixture with family floors was judged by
// its families alone, so the typed read reported ok at an overall rate of 0.83 against the 0.85 plan
// 02 declared. Family floors still decide by default; an EXPLICIT --min binds the overall rate too,
// so a caller who asks for a floor gets that floor.

export interface CalibrationVerdictInput {
  rate: number;
  min: number;
  minGiven: boolean;
  families: Array<{ ok: boolean }>;
  modelMatched: boolean | null;
}

export function calibrationOk({ rate, min, minGiven, families, modelMatched }: CalibrationVerdictInput): boolean {
  if (modelMatched === false) return false;
  if (!families.length) return rate >= min;
  return families.every((family) => family.ok) && (!minGiven || rate >= min);
}

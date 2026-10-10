export interface MatrixAnswer {
  type: 'noul' | 'choice' | 'score';
  noul?: number;
  choice?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export interface MatrixQuestion {
  type: 'noul' | 'choice' | 'score';
  instructions: string;
  criteria?: Record<string, unknown> | string[];
}

export interface MatrixRequest {
  state: Record<string, unknown>;
  questions: Record<string, MatrixQuestion>;
  model?: string;
}

export interface MatrixResponse {
  model?: string;
  answers?: Record<string, MatrixAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
}

export interface MatrixRow {
  id: string;
  right: boolean;
  picked: string | null;
  latencyMs: number;
  fallback?: string;
  confidence?: number | null;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const topConfidence = (answer: MatrixAnswer): number | null => {
  if (answer.type === 'noul') return finite(answer.noul) ? Math.max(answer.noul, 1 - answer.noul) : null;
  if (finite(answer.confidence)) return answer.confidence;
  const values = Object.values(answer.probabilities ?? {}).filter(finite);
  return values.length ? Math.max(...values) : null;
};

export function requestConfidence(response: MatrixResponse | null | undefined): number | null {
  const values = Object.values(response?.answers ?? {}).map(topConfidence).filter((value): value is number => value !== null);
  return values.length ? Math.min(...values) : null;
}

const caseOf = (id: string) => id.split('.')[0];

export function linkConfidence<T extends MatrixRow>(rows: T[], responses: Array<MatrixResponse | null>): { rows: T[]; linked: boolean } {
  if (rows.length === responses.length) return { rows: rows.map((row, index) => ({ ...row, confidence: requestConfidence(responses[index]) })), linked: true };
  const cases = [...new Set(rows.map((row) => caseOf(row.id)))];
  if (cases.length !== responses.length) return { rows: rows.map((row) => ({ ...row, confidence: null })), linked: false };
  const slot = new Map(cases.map((id, index) => [id, index]));
  return { rows: rows.map((row) => ({ ...row, confidence: requestConfidence(responses[slot.get(caseOf(row.id)) ?? -1]) })), linked: true };
}

const scored = (rows: MatrixRow[]) => rows.filter((row): row is MatrixRow & { confidence: number } => finite(row.confidence) && !row.fallback);

export function decisionBrier(rows: MatrixRow[]): number | null {
  const usable = scored(rows);
  if (!usable.length) return null;
  return usable.reduce((sum, row) => sum + (row.confidence - (row.right ? 1 : 0)) ** 2, 0) / usable.length;
}

export function expectedCalibrationError(rows: MatrixRow[], bins = 10): number | null {
  const usable = scored(rows);
  if (!usable.length) return null;
  const buckets = Array.from({ length: bins }, () => ({ count: 0, confidence: 0, right: 0 }));
  for (const row of usable) {
    const bucket = buckets[Math.min(bins - 1, Math.floor(row.confidence * bins))];
    bucket.count += 1;
    bucket.confidence += row.confidence;
    bucket.right += row.right ? 1 : 0;
  }
  return buckets.reduce((sum, bucket) => (bucket.count ? sum + (bucket.count / usable.length) * Math.abs(bucket.confidence / bucket.count - bucket.right / bucket.count) : sum), 0);
}

export function auroc(rows: MatrixRow[]): number | null {
  const usable = scored(rows);
  const positives = usable.filter((row) => row.right);
  const negatives = usable.filter((row) => !row.right);
  if (!positives.length || !negatives.length) return null;
  let wins = 0;
  for (const positive of positives) {
    for (const negative of negatives) wins += positive.confidence > negative.confidence ? 1 : positive.confidence === negative.confidence ? 0.5 : 0;
  }
  return wins / (positives.length * negatives.length);
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

export function flipRate(base: MatrixRow[], rotated: MatrixRow[]): { flips: number; compared: number; rate: number | null } {
  const byId = new Map(rotated.map((row) => [row.id, row]));
  let flips = 0;
  let compared = 0;
  for (const row of base) {
    const other = byId.get(row.id);
    if (!other || row.fallback || other.fallback) continue;
    compared += 1;
    if (other.picked !== row.picked) flips += 1;
  }
  return { flips, compared, rate: compared ? flips / compared : null };
}

export function twinAgreement(rows: MatrixRow[], suffix = 't'): { agree: number; pairs: number; rate: number | null } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let agree = 0;
  let pairs = 0;
  for (const row of rows) {
    if (row.id.endsWith(suffix)) continue;
    const twin = byId.get(`${row.id}${suffix}`);
    if (!twin || row.fallback || twin.fallback) continue;
    pairs += 1;
    if (twin.right === row.right) agree += 1;
  }
  return { agree, pairs, rate: pairs ? agree / pairs : null };
}

const reverseRecord = <T,>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).reverse());

export function rotateRequest(request: MatrixRequest): MatrixRequest {
  const questions = Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
    if (question.type === 'score' && Array.isArray(question.criteria)) return [key, { ...question, criteria: [...question.criteria].reverse() }];
    if (question.criteria && !Array.isArray(question.criteria)) return [key, { ...question, criteria: reverseRecord(question.criteria) }];
    return [key, question];
  }));
  return { ...request, questions };
}

export function unrotateResponse(response: MatrixResponse, original: MatrixRequest): MatrixResponse {
  if (!response.answers) return response;
  const answers = Object.fromEntries(Object.entries(response.answers).map(([key, answer]) => {
    const question = original.questions[key];
    if (answer.type !== 'score' || !question || !Array.isArray(question.criteria)) return [key, answer];
    const last = question.criteria.length - 1;
    const probabilities = Object.fromEntries(Object.entries(answer.probabilities ?? {}).map(([index, p]) => [String(last - Number(index)), p]));
    return [key, { ...answer, ...(finite(answer.score) ? { score: last - answer.score } : {}), probabilities }];
  }));
  return { ...response, answers };
}

export const questionsPerRequest = (requests: MatrixRequest[]): number | null =>
  requests.length ? requests.reduce((sum, request) => sum + Object.keys(request.questions).length, 0) / requests.length : null;

export function costPer1k(responses: Array<MatrixResponse | null>, decisions: number, tariff: { inputPerMillion: number; outputPerMillion: number } | null): number | null {
  if (!decisions) return null;
  const reported = responses.reduce((sum, response) => sum + (finite(response?.usage?.cost) ? response.usage.cost : 0), 0);
  if (reported > 0) return (reported / decisions) * 1000;
  if (!tariff) return 0;
  const tokens = responses.reduce((sum, response) => ({
    input: sum.input + (response?.usage?.input_tokens ?? 0),
    output: sum.output + (response?.usage?.output_tokens ?? 0),
  }), { input: 0, output: 0 });
  return (((tokens.input * tariff.inputPerMillion) + (tokens.output * tariff.outputPerMillion)) / 1e6 / decisions) * 1000;
}

export interface PreregNote {
  arm: string;
  model: string;
  uses: string[];
  runs: number;
  thresholds: string;
  budget: string;
  committed: string;
}

export function preregIssues(note: unknown, { arm, uses }: { arm: string; uses: string[] }): string[] {
  if (!note || typeof note !== 'object') return ['the preregistration note is not a JSON object'];
  const record = note as Record<string, unknown>;
  const issues = ['arm', 'model', 'thresholds', 'budget', 'committed'].filter((key) => typeof record[key] !== 'string' || !(record[key] as string).trim()).map((key) => `missing ${key}`);
  if (!Array.isArray(record.uses) || !record.uses.length) issues.push('missing uses');
  if (!Number.isInteger(record.runs) || (record.runs as number) < 1) issues.push('missing runs');
  if (typeof record.arm === 'string' && record.arm !== arm) issues.push(`the note is for arm ${record.arm}, not ${arm}`);
  if (Array.isArray(record.uses)) {
    const missing = uses.filter((use) => !(record.uses as string[]).includes(use));
    if (missing.length) issues.push(`the note does not cover ${missing.join(', ')}`);
  }
  return issues;
}

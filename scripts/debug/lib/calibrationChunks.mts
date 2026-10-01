export const PLUGIN_CALLS_PER_MINUTE = 60;
export const CHUNK_PAUSE_MS = 61_000;

export interface CalibrationRow {
  id: string;
  right: boolean;
  picked?: unknown;
  latencyMs?: number | null;
  fallback?: string;
}

export interface CalibrationReport {
  right: number;
  total: number;
  rows: CalibrationRow[];
  p50LatencyMs: number | null;
  model: string | null;
  [key: string]: unknown;
}

export function chunkRows<T>(rows: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`--chunk must be a positive integer (got ${size})`);
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) chunks.push(rows.slice(start, start + size));
  return chunks;
}

const caseOf = (id: string) => (id.includes('.') ? id.slice(0, id.indexOf('.')) : id);

export function mergeCalibrationReports(reports: CalibrationReport[]): CalibrationReport {
  if (reports.length === 1) return reports[0];
  const rows = reports.flatMap((report) => report.rows);
  const firstPerCase = new Map<string, CalibrationRow>();
  for (const row of rows) if (!firstPerCase.has(caseOf(row.id))) firstPerCase.set(caseOf(row.id), row);
  const timed = [...firstPerCase.values()].filter((row) => !row.fallback && typeof row.latencyMs === 'number').map((row) => row.latencyMs as number).sort((a, b) => a - b);
  const models = [...new Set(reports.map((report) => report.model).filter((model): model is string => Boolean(model)))];
  return {
    ...reports[0],
    right: reports.reduce((sum, report) => sum + report.right, 0),
    total: reports.reduce((sum, report) => sum + report.total, 0),
    rows,
    p50LatencyMs: timed.length ? timed[Math.floor((timed.length - 1) / 2)] : null,
    model: models.length === 1 ? models[0] : models.length ? models.join(',') : null,
    chunks: reports.length,
  };
}

export const busyRows = (rows: CalibrationRow[]) => rows.filter((row) => row.fallback === 'busy').map((row) => row.id);

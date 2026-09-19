export const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN);

export const std = (values: number[]) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
};

export const percentile = (values: number[], p: number) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

export const ratio = (hits: number, total: number) => (total ? hits / total : NaN);

export const pct = (value: number, digits = 0) => (Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : 'n/a');

export const fixed = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : 'n/a');

export const ms = (value: number) => (Number.isFinite(value) ? `${Math.round(value)} ms` : 'n/a');

export const frac = (hits: number, total: number) => `${hits}/${total} (${pct(ratio(hits, total))})`;

export interface BinaryRow { p: number; label: boolean }

export function auroc(rows: BinaryRow[]): number {
  const pos = rows.filter((row) => row.label).map((row) => row.p);
  const neg = rows.filter((row) => !row.label).map((row) => row.p);
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

export function brier(rows: BinaryRow[]): number {
  return mean(rows.map((row) => (row.p - (row.label ? 1 : 0)) ** 2));
}

export function binaryAccuracy(rows: BinaryRow[], threshold = 0.5): number {
  return ratio(rows.filter((row) => (row.p >= threshold) === row.label).length, rows.length);
}

export interface Bucket { from: number; to: number; count: number; meanPredicted: number; observed: number }

export function reliability(rows: BinaryRow[], edges = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0001]): { buckets: Bucket[]; ece: number } {
  const buckets: Bucket[] = [];
  let ece = 0;
  for (let index = 0; index < edges.length - 1; index += 1) {
    const inside = rows.filter((row) => row.p >= edges[index] && row.p < edges[index + 1]);
    if (!inside.length) continue;
    const meanPredicted = mean(inside.map((row) => row.p));
    const observed = mean(inside.map((row) => (row.label ? 1 : 0)));
    ece += (inside.length / rows.length) * Math.abs(meanPredicted - observed);
    buckets.push({ from: edges[index], to: Math.min(1, edges[index + 1]), count: inside.length, meanPredicted, observed });
  }
  return { buckets, ece };
}

export interface ConfidenceRow { confidence: number; correct: boolean }

export function coverageSweep(rows: ConfidenceRow[], thresholds = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
  return thresholds.map((threshold) => {
    const kept = rows.filter((row) => row.confidence >= threshold);
    return { threshold, coverage: ratio(kept.length, rows.length), accuracy: ratio(kept.filter((row) => row.correct).length, kept.length), kept: kept.length };
  });
}

export const noulConfidence = (p: number) => Math.abs(p - 0.5) * 2;

export function table(headers: string[], rows: Array<Array<string | number>>): string {
  const cell = (value: string | number) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const line = (cells: Array<string | number>) => `| ${cells.map(cell).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

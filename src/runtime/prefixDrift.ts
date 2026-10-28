import { checkPair, failingVerdict, type BoundarySource, type PairVerdict } from "./prefixStability";

export type PrefixDriftKind = "reply" | "side";

export interface PrefixDriftRecord {
  at: string;
  key: string;
  kind: PrefixDriftKind;
  chars: number;
  divergence: number | null;
  boundary: number | null;
  source: BoundarySource | null;
  verdict: PairVerdict;
  lost: number;
}

export interface PrefixDriftKeySummary {
  key: string;
  kind: PrefixDriftKind;
  pairs: number;
  aboveBoundary: number;
  noBoundary: number;
  worstLost: number;
  last: PairVerdict;
}

export type PrefixDriftBreak = (record: PrefixDriftRecord, first: boolean) => void;

export const PREFIX_DRIFT_RECORDS = 200;
export const PREFIX_DRIFT_KEYS = 32;

export class PrefixDrift {
  private readonly last = new Map<string, string>();
  private readonly warned = new Set<string>();
  private ring: PrefixDriftRecord[] = [];

  constructor(private readonly onBreak: PrefixDriftBreak = () => undefined, private readonly now: () => number = Date.now) {}

  observe(key: string, kind: PrefixDriftKind, prompt: string): PrefixDriftRecord | null {
    const previous = this.last.get(key);
    this.last.delete(key);
    this.last.set(key, prompt);
    while (this.last.size > PREFIX_DRIFT_KEYS) this.last.delete(this.last.keys().next().value as string);
    if (previous === undefined) return null;
    const check = checkPair(previous, prompt);
    const record: PrefixDriftRecord = {
      at: new Date(this.now()).toISOString(), key, kind, chars: prompt.length,
      divergence: check.divergence, boundary: check.boundary, source: check.source, verdict: check.verdict, lost: check.lost,
    };
    this.ring = [...this.ring, record].slice(-PREFIX_DRIFT_RECORDS);
    if (kind === "reply" && failingVerdict(check.verdict)) {
      const first = !this.warned.has(key);
      this.warned.add(key);
      this.onBreak(record, first);
    }
    return record;
  }

  records(): PrefixDriftRecord[] {
    return [...this.ring];
  }

  summary(): PrefixDriftKeySummary[] {
    const byKey = new Map<string, PrefixDriftKeySummary>();
    for (const record of this.ring) {
      const row = byKey.get(record.key) ?? { key: record.key, kind: record.kind, pairs: 0, aboveBoundary: 0, noBoundary: 0, worstLost: 0, last: record.verdict };
      row.pairs += 1;
      if (record.verdict === "above-boundary") row.aboveBoundary += 1;
      if (record.verdict === "no-boundary") row.noBoundary += 1;
      row.worstLost = Math.max(row.worstLost, record.lost);
      row.last = record.verdict;
      byKey.set(record.key, row);
    }
    return [...byKey.values()];
  }

  clear(): void {
    this.last.clear();
    this.warned.clear();
    this.ring = [];
  }
}

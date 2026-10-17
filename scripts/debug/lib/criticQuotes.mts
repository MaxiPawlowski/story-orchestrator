import { foldTerm } from '../../../src/utils/termPresent.ts';

export interface CriticRecord { verdicts?: Array<{ raw?: string; issues?: unknown }>; beats?: unknown }

export interface CriticQuoteTally {
  verdicts: number;
  judgeVerdicts: number;
  modelVerdicts: number;
  findings: number;
  quotedFindings: number;
  quotes: number;
  absentQuotes: number;
  findingsWithAbsentQuote: number;
}

const QUOTE = /"([^"]{3,})"|“([^”]{3,})”|‘([^’]{3,})’|'([^']{3,})'/g;

export const quotesIn = (finding: string): string[] =>
  [...finding.matchAll(QUOTE)].map((match) => (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim()).filter(Boolean);

const folded = (text: string): string => foldTerm(text).toLowerCase().replace(/\s+/g, ' ');

export const quotePresent = (candidate: string, quote: string): boolean => folded(candidate).includes(folded(quote));

export function tallyCriticQuotes(records: readonly CriticRecord[]): CriticQuoteTally {
  const tally: CriticQuoteTally = { verdicts: 0, judgeVerdicts: 0, modelVerdicts: 0, findings: 0, quotedFindings: 0, quotes: 0, absentQuotes: 0, findingsWithAbsentQuote: 0 };
  for (const record of records) {
    const candidate = JSON.stringify(record.beats ?? '');
    for (const verdict of record.verdicts ?? []) {
      tally.verdicts += 1;
      if (verdict.raw === 'JUDGE') { tally.judgeVerdicts += 1; continue; }
      tally.modelVerdicts += 1;
      const issues = Array.isArray(verdict.issues) ? verdict.issues.filter((issue): issue is string => typeof issue === 'string') : [];
      for (const issue of issues) {
        tally.findings += 1;
        const quotes = quotesIn(issue);
        if (!quotes.length) continue;
        tally.quotedFindings += 1;
        tally.quotes += quotes.length;
        const absent = quotes.filter((quote) => !quotePresent(candidate, quote)).length;
        tally.absentQuotes += absent;
        if (absent) tally.findingsWithAbsentQuote += 1;
      }
    }
  }
  return tally;
}

export function criticRecordsIn(value: unknown, out: CriticRecord[] = []): CriticRecord[] {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray((value as CriticRecord).verdicts) && 'beats' in (value as object)) out.push(value as CriticRecord);
  for (const child of Object.values(value as Record<string, unknown>)) criticRecordsIn(child, out);
  return out;
}

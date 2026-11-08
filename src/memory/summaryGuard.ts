import { foldName } from "./nameFold";
import { isRefusal } from "./refusalGuard";

export const SUMMARY_MIN_SHARE = 0.6;
export type SummaryGuardRefusal = "dropped-detail" | "collapsed" | "refused";

const NOT_NAMES = new Set(["the", "a", "an", "he", "she", "they", "it", "i", "we", "you", "his", "her", "their", "its", "our", "your", "this", "that", "these",
  "those", "there", "then", "when", "while", "after", "before", "later", "now", "meanwhile", "still", "yet", "but", "and", "or", "so", "as", "at", "in", "on",
  "with", "by", "for", "from", "to", "of", "if", "once", "soon", "both", "each", "all", "some", "none", "no", "not", "one", "two", "everyone", "nobody", "someone"]);

const SPAN = /\p{Lu}[\p{L}'’-]*(?:\s+(?:of\s+|the\s+)?\p{Lu}[\p{L}'’-]*)*/gu;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const mentions = (text: string, name: string): boolean => {
  const folded = foldName(name);
  return Boolean(folded) && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(folded)}($|[^\\p{L}\\p{N}])`, "u").test(foldName(text));
};

const SENTENCE_START = /(^|[.!?]["'’”)\]]?\s+|\n\s*)$/;

export function namesIn(text: string, vocabulary: readonly string[] = []): string[] {
  const found = [...text.matchAll(SPAN)].map((match) => {
    const words = match[0].split(/\s+/);
    const lead = NOT_NAMES.has(words[0].toLowerCase()) ? 1 : 0;
    return { name: words.slice(lead).join(" "), opening: lead === 0 && SENTENCE_START.test(text.slice(0, match.index ?? 0)) };
  }).filter((span) => span.name && !NOT_NAMES.has(span.name.toLowerCase()));
  const inner = new Set(found.filter((span) => !span.opening).map((span) => foldName(span.name)));
  const known = vocabulary.filter((name) => name.trim() && mentions(text, name));
  const spans = found.filter((span) => !span.opening || inner.has(foldName(span.name)) || known.some((name) => foldName(name) === foldName(span.name))).map((span) => span.name);
  const seen = new Set<string>();
  return [...known, ...spans].filter((name) => {
    const key = foldName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface SummaryGuardInput {
  summary: string;
  previous: string | null;
  window: string;
  vocabulary: readonly string[];
  covered: (name: string) => boolean;
}

export type SummaryGuardVerdict = { ok: true; entities: string[] } | { ok: false; reason: SummaryGuardRefusal; dropped: number };

export function guardSummary({ summary, previous, window, vocabulary, covered }: SummaryGuardInput): SummaryGuardVerdict {
  if (isRefusal(summary, window, vocabulary)) return { ok: false, reason: "refused", dropped: 0 };
  const entities = namesIn(summary, vocabulary);
  const before = previous?.trim() ?? "";
  if (!before) return { ok: true, entities };
  const dropped = namesIn(before, vocabulary).filter((name) => !mentions(summary, name) && !covered(name));
  if (dropped.length) return { ok: false, reason: "dropped-detail", dropped: dropped.length };
  if (window.trim() && summary.trim().length < before.length * SUMMARY_MIN_SHARE) return { ok: false, reason: "collapsed", dropped: 0 };
  return { ok: true, entities };
}

export interface CoverageRows {
  entries: ReadonlyArray<{ tier: string; text: string; entities: readonly string[]; supersededBy?: string; foldedInto?: string }>;
  ledger: ReadonlyArray<{ entity: string; value: string }>;
  arcs: ReadonlyArray<{ text: string; status: string; entities?: readonly string[] }>;
  chapters: ReadonlyArray<{ summary: string; short: string }>;
}

export function coverageOf(rows: CoverageRows): (name: string) => boolean {
  const texts = [
    ...rows.entries.filter((entry) => entry.tier !== "short_term" && !entry.supersededBy && !entry.foldedInto).flatMap((entry) => [entry.text, ...entry.entities]),
    ...rows.ledger.flatMap((row) => [row.entity, row.value]),
    ...rows.arcs.filter((arc) => arc.status === "open").flatMap((arc) => [arc.text, ...(arc.entities ?? [])]),
    ...rows.chapters.flatMap((record) => [record.summary, record.short]),
  ];
  return (name) => texts.some((text) => mentions(text, name));
}

export interface SummaryState extends CoverageRows {
  settings: { summaryGuard?: boolean };
}

export function judgeSummary(state: SummaryState, names: readonly string[], summary: string, previous: string | null, window: string): SummaryGuardVerdict {
  if (state.settings.summaryGuard === false) return { ok: true, entities: [] };
  const vocabulary = [...new Set([...names, ...state.entries.flatMap((entry) => entry.entities)])];
  return guardSummary({ summary, previous, window, vocabulary, covered: coverageOf(state) });
}

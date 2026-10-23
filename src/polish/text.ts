export interface Span {
  start: number;
  end: number;
}

const CLOSERS: Readonly<Record<string, string>> = { "\"": "\"", "“": "”" };

export const quoteSpans = (text: string): Span[] | null => {
  const spans: Span[] = [];
  let index = 0;
  while (index < text.length) {
    const close = CLOSERS[text[index]];
    if (!close) { index += 1; continue; }
    const end = text.indexOf(close, index + 1);
    if (end < 0) return null;
    spans.push({ start: index, end: end + 1 });
    index = end + 1;
  }
  if ((text.match(/“/g)?.length ?? 0) !== (text.match(/”/g)?.length ?? 0)) return null;
  return spans;
};

export const inside = (position: number, spans: readonly Span[]): boolean => spans.some((span) => position > span.start && position < span.end);

const covered = (span: Span, spans: readonly Span[]): boolean => spans.some((quote) => span.start < quote.end && span.end > quote.start);

const END = /[.!?…]+["'”’)\]*_]*(?=\s|$)|\n+/g;

export const sentenceSpans = (text: string, quotes: readonly Span[]): Span[] => {
  const spans: Span[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body) spans.push({ start: start + lead, end: start + lead + body.length });
  };
  for (const match of text.matchAll(END)) {
    const end = (match.index ?? 0) + match[0].length;
    if (inside(end, quotes)) continue;
    push(end);
    start = end;
  }
  push(text.length);
  return spans;
};

const fold = (text: string): string => {
  const folded = text.replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[–—]/g, "-").toLowerCase();
  return folded.length === text.length ? folded : text;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const EDGE = /[\p{L}\p{N}]/u;

export const phraseSpans = (text: string, phrase: string): Span[] => {
  const target = fold(phrase.trim());
  if (!target) return [];
  const head = EDGE.test(target.charAt(0)) ? "(?<![\\p{L}\\p{N}])" : "";
  const tail = EDGE.test(target.charAt(target.length - 1)) ? "(?![\\p{L}\\p{N}])" : "";
  const pattern = new RegExp(`${head}${escape(target)}${tail}`, "gu");
  return [...fold(text).matchAll(pattern)].map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
};

export const phraseCount = (text: string, phrase: string): number => phraseSpans(text, phrase).length;

export const outsideQuotes = (spans: readonly Span[], quotes: readonly Span[]): Span[] => spans.filter((span) => !covered(span, quotes));

export const quotedTexts = (text: string): string[] | null => quoteSpans(text)?.map((span) => text.slice(span.start, span.end)) ?? null;

export const normalizeSpace = (text: string): string => text.replace(/\s+/g, " ").trim();

export const words = (text: string): string[] => (text.toLowerCase().replace(/[’]/g, "'").match(/[\p{L}\p{N}']+/gu) ?? []);

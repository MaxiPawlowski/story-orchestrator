export const REPETITION_WINDOW = 6;
export const REPETITION_MIN_EARLIER = 2;
export const REPETITION_MIN_WORDS = 3;
export const REPETITION_MAX_WORDS = 8;
export const REPETITION_MAX_HOT = 4;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "by", "for", "with", "from", "into", "onto", "over", "up", "down", "out", "off",
  "as", "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "these", "those", "there", "here", "then", "than",
  "he", "she", "they", "you", "i", "we", "him", "her", "them", "his", "their", "your", "my", "our", "me", "us",
  "not", "no", "so", "if", "when", "while", "who", "what", "which", "where", "how", "all", "one", "some", "just", "too", "very",
  "has", "have", "had", "do", "does", "did", "will", "would", "can", "could", "says", "said", "say",
]);

interface Token {
  word: string;
  proper: boolean;
}

export interface RepetitionConstruction {
  id: string;
  label: string;
  pattern: RegExp;
}

export const STOCK_CONSTRUCTIONS: readonly RepetitionConstruction[] = [
  { id: "not-but", label: "\"not X, but Y\"", pattern: /\bnot (?:\w+\s){0,2}\w+,? but\b/i },
  { id: "somewhere", label: "\"somewhere in the distance\"", pattern: /\bsomewhere (?:in the distance|nearby|below|above|far off)\b/i },
  { id: "mix-of", label: "\"a mix of X and Y\"", pattern: /\ba mix(?:ture)? of \w+ and \w+\b/i },
  { id: "held-breath", label: "\"a breath they didn't know they were holding\"", pattern: /\bbreath (?:she|he|they|you|i) (?:didn't|did not) know (?:she|he|they|you|i) (?:was|were) holding\b/i },
];

export interface RepetitionReport {
  replies: number;
  hot: string[];
  constructions: string[];
  loops: boolean;
}

const tokens = (text: string): Token[] => (text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).map((raw) => ({ word: raw.toLowerCase().replace(/’/g, "'"), proper: /^[A-Z]/.test(raw) }));

const contentOf = (gram: Token[]) => gram.filter((token) => !STOPWORDS.has(token.word));

const counts = (gram: Token[]): boolean => {
  const content = contentOf(gram);
  return content.length >= 2 && !content.every((token) => token.proper);
};

const phrasesOf = (text: string): Map<string, boolean> => {
  const list = tokens(text);
  const phrases = new Map<string, boolean>();
  for (let size = REPETITION_MIN_WORDS; size <= REPETITION_MAX_WORDS; size += 1) {
    for (let start = 0; start + size <= list.length; start += 1) {
      const gram = list.slice(start, start + size);
      const key = gram.map((token) => token.word).join(" ");
      if (!phrases.has(key)) phrases.set(key, counts(gram));
    }
  }
  return phrases;
};

const maximal = (phrases: string[]): string[] =>
  phrases.filter((phrase) => !phrases.some((other) => other !== phrase && other.includes(phrase)));

export function mineRepetition(replies: readonly string[]): RepetitionReport {
  const window = replies.slice(-REPETITION_WINDOW);
  const latest = window[window.length - 1];
  if (!latest || window.length < REPETITION_MIN_EARLIER + 1) return { replies: window.length, hot: [], constructions: [], loops: false };
  const earlier = window.slice(0, -1).map(phrasesOf);
  const hot = [...phrasesOf(latest)]
    .filter(([phrase, counted]) => counted && earlier.filter((seen) => seen.has(phrase)).length >= REPETITION_MIN_EARLIER)
    .map(([phrase]) => phrase);
  const named = maximal(hot).sort((left, right) => right.length - left.length).slice(0, REPETITION_MAX_HOT);
  const constructions = STOCK_CONSTRUCTIONS
    .filter((entry) => entry.pattern.test(latest) && window.slice(0, -1).filter((reply) => entry.pattern.test(reply)).length >= REPETITION_MIN_EARLIER)
    .map((entry) => entry.label);
  return { replies: window.length, hot: named, constructions, loops: named.length > 0 || constructions.length > 0 };
}

export const replyTexts = (rows: readonly unknown[]): string[] => rows.flatMap((row) => {
  if (typeof row !== "object" || row === null) return [];
  const shaped = row as { is_user?: unknown; is_system?: unknown; mes?: unknown };
  return shaped.is_user === true || shaped.is_system === true || typeof shaped.mes !== "string" || !shaped.mes.trim() ? [] : [shaped.mes];
});

export const repetitionText = (report: RepetitionReport): string | null => {
  if (!report.loops) return null;
  return `Repeating across the last ${report.replies} replies: ${[...report.hot.map((phrase) => `"${phrase}"`), ...report.constructions].join(", ")}`;
};

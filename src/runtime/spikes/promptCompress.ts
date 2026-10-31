import { contentWords, wordSimilarity } from "@memory/words";

export const COMPRESS_KEEP_TAIL = 2;
export const COMPRESS_TARGET_RATIO = 0.75;
export const COMPRESS_REDUNDANT_SIMILARITY = 0.6;
export const COMPRESS_FLOORS = { tokensSavedMin: 0.15, entityRetention: 1, quoteRetention: 1, numberRetention: 1 } as const;

export interface CompressSegment {
  id: string;
  text: string;
}

export interface CompressOptions {
  keepTail?: number;
  targetRatio?: number;
  protect?: readonly string[];
}

export interface CompressResult {
  segments: CompressSegment[];
  tokensBefore: number;
  tokensAfter: number;
  dropped: Array<{ id: string; sentence: string }>;
}

export const compressTokens = (text: string): number => Math.ceil(text.length / 4);

const SENTENCE = /[^.!?]+(?:[.!?]+["')\]]*|$)/g;

export const splitSentences = (text: string): string[] => {
  const out: string[] = [];
  let quoteOpen = false;
  let carry = "";
  for (const piece of text.match(SENTENCE) ?? []) {
    carry += piece;
    quoteOpen = ((carry.match(/"/g) ?? []).length % 2) === 1;
    if (!quoteOpen && carry.trim()) {
      out.push(carry.trim());
      carry = "";
    }
  }
  if (carry.trim()) out.push(carry.trim());
  return out.reduce<string[]>((joined, sentence) => {
    const last = joined.at(-1);
    if (last !== undefined && /^[a-z]/.test(sentence)) joined[joined.length - 1] = `${last} ${sentence}`;
    else joined.push(sentence);
    return joined;
  }, []);
};

const NAME = /(?<![.!?]\s|^)\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g;

export const namesIn = (text: string): string[] => [...new Set([...splitSentences(text)].flatMap((sentence) => sentence.match(NAME) ?? []))];

export const hasQuote = (sentence: string): boolean => /"[^"]+"/.test(sentence) || /“[^”]+”/.test(sentence);

export const numbersIn = (text: string): string[] => [...new Set(text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [])];

interface Unit {
  segment: number;
  index: number;
  text: string;
  words: Set<string>;
  names: string[];
  quote: boolean;
  numbers: string[];
  score: number;
  keep: boolean;
}

const informationScore = (unit: Pick<Unit, "words" | "names" | "quote" | "numbers" | "text">): number =>
  unit.words.size / Math.max(1, compressTokens(unit.text)) + unit.names.length * 0.5 + (unit.quote ? 2 : 0) + unit.numbers.length * 0.5;

export function compressSegments(input: readonly CompressSegment[], options: CompressOptions = {}): CompressResult {
  const keepTail = options.keepTail ?? COMPRESS_KEEP_TAIL;
  const target = options.targetRatio ?? COMPRESS_TARGET_RATIO;
  const protect = (options.protect ?? []).map((word) => word.toLowerCase());
  const tokensBefore = compressTokens(input.map((segment) => segment.text).join("\n"));
  const head = Math.max(0, input.length - keepTail);
  const units: Unit[] = input.slice(0, head).flatMap((segment, index) => splitSentences(segment.text).map((text, at) => {
    const base = { text, words: contentWords(text), names: namesIn(text), quote: hasQuote(text), numbers: numbersIn(text) };
    return { segment: index, index: at, ...base, score: informationScore(base), keep: true };
  }));
  const kept: Unit[] = [];
  for (const unit of units) {
    const covered = (other: Unit) => wordSimilarity(other.words, unit.words) >= COMPRESS_REDUNDANT_SIMILARITY
      && unit.names.every((name) => other.names.includes(name)) && unit.numbers.every((number) => other.numbers.includes(number));
    if (!unit.quote && kept.some(covered)) unit.keep = false;
    else kept.push(unit);
  }
  const budget = Math.floor(compressTokens(units.map((unit) => unit.text).join(" ")) * target);
  const tokensOf = () => compressTokens(units.filter((unit) => unit.keep).map((unit) => unit.text).join(" "));
  const count = (pick: (unit: Unit) => readonly string[], value: string) => units.filter((unit) => unit.keep && pick(unit).includes(value)).length;
  const removable = (unit: Unit) => unit.keep && !unit.quote
    && units.filter((other) => other.keep && other.segment === unit.segment).length > 1
    && unit.names.every((name) => count((other) => other.names, name) > 1)
    && unit.numbers.every((number) => count((other) => other.numbers, number) > 1)
    && !protect.some((word) => unit.text.toLowerCase().includes(word));
  const order = [...units].sort((left, right) => left.score - right.score || right.segment - left.segment || right.index - left.index);
  for (const unit of order) {
    if (tokensOf() <= budget) break;
    if (removable(unit)) unit.keep = false;
  }
  const segments = input.map((segment, index) => (index >= head ? { ...segment } : {
    id: segment.id,
    text: units.filter((unit) => unit.segment === index && unit.keep).map((unit) => unit.text).join(" "),
  }));
  return {
    segments,
    tokensBefore,
    tokensAfter: compressTokens(segments.map((segment) => segment.text).join("\n")),
    dropped: units.filter((unit) => !unit.keep).map((unit) => ({ id: input[unit.segment]?.id ?? "", sentence: unit.text })),
  };
}

export interface CompressMetrics {
  histories: number;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  entityRetention: number;
  quoteRetention: number;
  numberRetention: number;
}

const retention = (before: string[], after: string) => (before.length ? before.filter((item) => after.includes(item)).length / before.length : 1);

export function measureCompression(histories: readonly CompressSegment[][], options: CompressOptions = {}): CompressMetrics {
  let before = 0;
  let after = 0;
  const entity: number[] = [];
  const quote: number[] = [];
  const number: number[] = [];
  for (const history of histories) {
    const result = compressSegments(history, options);
    before += result.tokensBefore;
    after += result.tokensAfter;
    const original = history.map((segment) => segment.text).join("\n");
    const shown = result.segments.map((segment) => segment.text).join("\n");
    entity.push(retention(namesIn(original), shown));
    quote.push(retention(splitSentences(original).filter(hasQuote), shown));
    number.push(retention(numbersIn(original), shown));
  }
  const mean = (values: number[]) => (values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : 1);
  return {
    histories: histories.length, tokensBefore: before, tokensAfter: after, tokensSaved: before ? Number(((before - after) / before).toFixed(4)) : 0,
    entityRetention: mean(entity), quoteRetention: mean(quote), numberRetention: mean(number),
  };
}

export const compressVerdict = (metrics: CompressMetrics) => {
  const tokens = metrics.tokensSaved >= COMPRESS_FLOORS.tokensSavedMin;
  const entities = metrics.entityRetention >= COMPRESS_FLOORS.entityRetention;
  const quotes = metrics.quoteRetention >= COMPRESS_FLOORS.quoteRetention;
  const numbers = metrics.numberRetention >= COMPRESS_FLOORS.numberRetention;
  return { tokens, entities, quotes, numbers, ok: tokens && entities && quotes && numbers };
};

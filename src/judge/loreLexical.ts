import type { LoreEntry } from "./lore";

export interface LexicalEntry extends LoreEntry {
  keys?: readonly string[];
}

export interface LexicalScore<T extends LexicalEntry = LexicalEntry> {
  entry: T;
  score: number;
}

export const LEXICAL_K1 = 1.2;
export const LEXICAL_B = 0.75;
export const LEXICAL_MIN_SCORE = 1;
export const LEXICAL_FALLBACK_PICKS = 2;
export const LEXICAL_PREFILTER = 12;
export const LEXICAL_LAST_LINE_WEIGHT = 2;
export const UNKNOWN_ENTITY_PENALTY = 0.1;

const STOPWORDS = new Set(("a an the and or but if then than so to of in on at by for with from into onto over under about as is are was were be been being "
  + "it its this that these those he she they them his her their our we you your i me my mine not no do does did have has had will would can could "
  + "should shall may might must just what which who whom whose when where why how all any some more most other such only own same very").split(" "));

export const foldToken = (word: string): string => {
  let token = word.toLowerCase().replace(/[‘’]/g, "'").replace(/'s$|'$/u, "");
  if (token.length > 4 && token.endsWith("ies")) token = `${token.slice(0, -3)}y`;
  else if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) token = token.slice(0, -1);
  return token;
};

export const lexicalTokens = (text: string): string[] =>
  (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).flatMap((word) => word.split("-")).map(foldToken).filter((token) => token.length >= 2 && !STOPWORDS.has(token));

export const entryText = (entry: LexicalEntry): string => [entry.comment, ...(entry.keys ?? []), entry.content].join(" \n ");

export interface LexicalQuery {
  window: ReadonlyArray<{ speaker: string; text: string }>;
  terms?: readonly string[];
}

export const queryWeights = (query: LexicalQuery): Map<string, number> => {
  const weights = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const token of lexicalTokens(text)) weights.set(token, (weights.get(token) ?? 0) + weight);
  };
  query.window.forEach((line, index) => add(line.text, index === query.window.length - 1 ? LEXICAL_LAST_LINE_WEIGHT : 1));
  for (const term of query.terms ?? []) add(term, 1);
  return weights;
};

export function lexicalRank<T extends LexicalEntry>(entries: readonly T[], query: LexicalQuery): Array<LexicalScore<T>> {
  const docs = entries.map((entry) => {
    const counts = new Map<string, number>();
    const tokens = lexicalTokens(entryText(entry));
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return { entry, counts, length: tokens.length };
  });
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docs.length);
  const frequency = new Map<string, number>();
  for (const doc of docs) for (const token of doc.counts.keys()) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  const weights = queryWeights(query);
  return docs.map((doc) => {
    let score = 0;
    for (const [token, weight] of weights) {
      const tf = doc.counts.get(token);
      if (!tf) continue;
      const df = frequency.get(token) ?? 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      score += weight * idf * ((tf * (LEXICAL_K1 + 1)) / (tf + LEXICAL_K1 * (1 - LEXICAL_B + (LEXICAL_B * doc.length) / Math.max(1, average))));
    }
    return { entry: doc.entry, score: Number(score.toFixed(6)) };
  }).sort((left, right) => right.score - left.score || left.entry.uid - right.entry.uid);
}

const keyOf = (entry: Pick<LoreEntry, "world" | "uid">) => `${entry.world}.${entry.uid}`;

export const lexicalScores = (ranked: ReadonlyArray<LexicalScore>): Map<string, number> => new Map(ranked.map((row) => [keyOf(row.entry), row.score]));

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const named = (haystack: string, needle: string) => needle.trim().length >= 2
  && new RegExp(`(?<![\\p{L}\\p{N}])${escapePattern(needle.trim()).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "iu").test(haystack);

export const entryNames = (entry: LexicalEntry): string[] => {
  const label = entry.comment.split(/\s[-:–—|]\s/).pop()?.trim() ?? "";
  return [...new Set([...(entry.keys ?? []).filter((key) => !/^\/.*\/[a-z]*$/i.test(key)), label].map((name) => name.trim()).filter((name) => name.length >= 3))];
};

export const namedEntries = (entries: readonly LexicalEntry[], window: ReadonlyArray<{ text: string }>): string[] => {
  const text = window.map((line) => line.text).join("\n");
  return entries.filter((entry) => entryNames(entry).some((name) => named(text, name))).map(keyOf).sort();
};

export const aboutUnknown = (entry: LexicalEntry, unknown: readonly string[]): boolean => {
  const label = [entry.comment, ...(entry.keys ?? [])].join("\n");
  return unknown.some((name) => named(label, name));
};

export interface LexicalFallbackOptions {
  picks?: number;
  minScore?: number;
  unknown?: readonly string[];
}

export function lexicalFallback<T extends LexicalEntry>(ranked: ReadonlyArray<LexicalScore<T>>, options: LexicalFallbackOptions = {}): Array<LexicalScore<T>> {
  const unknown = options.unknown ?? [];
  return ranked.filter((row) => row.score >= (options.minScore ?? LEXICAL_MIN_SCORE) && !aboutUnknown(row.entry, unknown)).slice(0, options.picks ?? LEXICAL_FALLBACK_PICKS);
}

export function lexicalPool<T extends LexicalEntry>(ranked: ReadonlyArray<LexicalScore<T>>, cap: number = LEXICAL_PREFILTER): T[] {
  return ranked.slice(0, cap).map((row) => row.entry);
}

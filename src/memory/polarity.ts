import type { MatchSets } from "./consolidate";
import type { MemoryEntry } from "./types";

export const NEGATORS: ReadonlySet<string> = new Set([
  "not", "no", "never", "nobody", "nothing", "none", "neither", "nor", "nowhere", "without",
  "nunca", "jamás", "jamas", "sin", "ningún", "ninguno", "ninguna", "nadie", "nada", "tampoco", "ni",
]);

const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "over", "under", "that", "this", "these", "those", "there", "here",
  "was", "were", "are", "been", "being", "has", "have", "had", "does", "did", "will", "would", "can", "could", "should",
  "its", "his", "her", "hers", "their", "they", "them", "she", "him", "you", "your", "our", "who", "whom", "which",
  "than", "then", "when", "while", "about", "after", "before", "still", "also", "very", "just", "some", "any", "all", "one",
  "los", "las", "una", "unos", "unas", "del", "con", "por", "para", "son", "era", "eran", "fue", "fueron", "está", "están",
  "estaba", "han", "sus", "que", "como", "más", "muy", "pero", "tras", "sobre", "entre", "este", "esta", "ese", "esa", "aún",
]);

export function polarityTokens(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/n't\b/g, " not")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export const isNegative = (text: string): boolean => polarityTokens(text).some((token) => NEGATORS.has(token));

export const subjectTokens = (text: string): Set<string> =>
  new Set(polarityTokens(text).filter((token) => token.length >= 3 && !NEGATORS.has(token) && !FUNCTION_WORDS.has(token)));

export function subjectOverlap(left: string, right: string): number {
  const a = subjectTokens(left);
  const b = subjectTokens(right);
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / new Set([...a, ...b]).size;
}

export const opposedPolarity = (left: string, right: string, subjectFloor: number): boolean =>
  isNegative(left) !== isNegative(right) && subjectOverlap(left, right) >= subjectFloor;

export function polarityMatchSets(group: MemoryEntry[], subjectFloor: number): MatchSets {
  const sameTopic = group.map((row, index) => new Set(group.flatMap((other, at) => (at !== index && opposedPolarity(row.text, other.text, subjectFloor) ? [at] : []))));
  return { dup: group.map(() => new Set<number>()), sameTopic };
}

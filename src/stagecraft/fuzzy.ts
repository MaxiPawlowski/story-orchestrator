import { levenshtein } from "@utils/levenshtein";
import { FUZZY_ANCHOR_THRESHOLD, PATCH_ANCHOR_SEPARATOR } from "./types";

const MIN_ANCHOR_WORDS = 3;
const SEPARATORS = /\|\||\.\.\.|…/;

interface Token { text: string; start: number; end: number }

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

const tokenize = (value: string): Token[] => [...value.matchAll(WORD)].map((match) => ({ text: match[0].toLowerCase().replace(/['’]/g, ""), start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));

export const anchorSimilarity = (left: string, right: string): number => {
  const longest = Math.max(left.length, right.length);
  return longest ? 1 - levenshtein(left, right) / longest : 1;
};

interface Window { first: number; last: number; score: number }

const overlaps = (left: Window, right: Window) => left.first <= right.last && right.first <= left.last;

const bestWindow = (tokens: Token[], phrase: string[], from: number): Window | null => {
  const wanted = phrase.join(" ");
  const candidates: Window[] = [];
  for (const size of [phrase.length - 1, phrase.length, phrase.length + 1]) {
    if (size < 1) continue;
    for (let first = from; first + size <= tokens.length; first += 1) {
      const score = anchorSimilarity(tokens.slice(first, first + size).map((token) => token.text).join(" "), wanted);
      if (score >= FUZZY_ANCHOR_THRESHOLD) candidates.push({ first, last: first + size - 1, score });
    }
  }
  if (!candidates.length) return null;
  const best = candidates.reduce((top, candidate) => (candidate.score > top.score ? candidate : top));
  if (candidates.some((candidate) => !overlaps(candidate, best))) return null;
  return { first: snap(tokens, best.first, phrase[0], -1, from), last: snap(tokens, best.last, phrase[phrase.length - 1], 1, from), score: best.score };
};

const EDGE_REACH = 2;

const snap = (tokens: Token[], edge: number, word: string, step: -1 | 1, from: number): number => {
  if (tokens[edge].text === word) return edge;
  for (let distance = 1; distance <= EDGE_REACH; distance += 1) {
    const at = edge + step * distance;
    if (at < from || at >= tokens.length) return edge;
    if (tokens[at].text === word) return at;
  }
  return edge;
};

export interface FuzzySpan {
  start: number;
  end: number;
  score: number;
  anchor: string;
}

export function findSpanFuzzy(content: string, anchor: string): FuzzySpan | null {
  const [head = "", ...rest] = anchor.split(SEPARATORS).map((part) => part.trim()).filter(Boolean);
  const tail = rest.length ? rest[rest.length - 1] : "";
  const headWords = tokenize(head).map((token) => token.text);
  const tailWords = tokenize(tail).map((token) => token.text);
  if (headWords.length < MIN_ANCHOR_WORDS || (tail && tailWords.length < MIN_ANCHOR_WORDS)) return null;
  const tokens = tokenize(content);
  const first = bestWindow(tokens, headWords, 0);
  if (!first) return null;
  const last = tail ? bestWindow(tokens, tailWords, first.first) : first;
  if (!last || last.last < first.last) return null;
  const start = tokens[first.first].start;
  const end = tokens[last.last].end;
  const headText = content.slice(start, tokens[first.last].end);
  const tailText = content.slice(tokens[last.first].start, end);
  if (SEPARATORS.test(headText) || SEPARATORS.test(tailText)) return null;
  return { start, end, score: Math.min(first.score, last.score), anchor: tail ? `${headText} ${PATCH_ANCHOR_SEPARATOR} ${tailText}` : headText };
}

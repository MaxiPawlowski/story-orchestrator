const MIN_WORDS = 6;
const FRAGMENT_WORDS = 4;
const DIALOGUE_TAG = /^\s*\*\s*(?:she|he|they|i|[A-Z][a-z]+)\s+(?:asks|says|adds|murmurs|mutters|whispers|continues|presses|demands)\b[^*\n]*\*/i;

interface QuestionSpan {
  start: number;
  end: number;
  whole: boolean;
  questionEnd: number;
  fragment?: boolean;
}

export type KeepLastQuestionReason = "empty" | "too-short" | "unbalanced" | "question-count";

export type KeepLastQuestionResult =
  | { action: "untouched"; text: string; questions: number }
  | { action: "trimmed"; text: string; questions: number; removedWords: number; joined?: boolean }
  | { action: "rejected"; text: string; questions: number; reasons: KeepLastQuestionReason[] };

const count = (text: string, mark: string): number => [...text].filter((char) => char === mark).length;

const wordCount = (text: string): number => text.replace(/[*"_“”]/g, " ").split(/\s+/).filter(Boolean).length;

const balanced = (text: string): boolean => count(text, "\"") % 2 === 0 && count(text, "*") % 2 === 0 && count(text, "“") === count(text, "”");

const joinFragment = (sentence: string): string => sentence.replace(/\?\s+([A-Z])/, (_match, first: string) => ` — ${first.toLowerCase()}`);

const tidy = (text: string, keepBlankLines: boolean): string => text
  .replace(/""/g, "")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n[ \t]+/g, "\n")
  .replace(keepBlankLines ? /\n{3,}/g : /\n{2,}/g, keepBlankLines ? "\n\n" : "\n")
  .replace(/ {2,}/g, " ")
  .trim();

const mergeFragments = (text: string, spans: QuestionSpan[]): QuestionSpan[] => {
  const merged: QuestionSpan[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    const body = text.slice(span.start, span.end);
    const followsDirectly = previous ? /^\s*$/.test(text.slice(previous.questionEnd, span.start)) : false;
    if (previous && !previous.whole && !/["*]/.test(body) && wordCount(body) <= FRAGMENT_WORDS && followsDirectly) {
      previous.end = span.end;
      previous.fragment = true;
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
};

const questionSpans = (text: string): QuestionSpan[] => {
  const spans: QuestionSpan[] = [];
  let quoteOpen = false;
  let starOpen = false;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"") { quoteOpen = !quoteOpen; start = index + 1; continue; }
    if (char === "*") { starOpen = !starOpen; start = index + 1; continue; }
    if (char === "\n" || char === "." || char === "!" || char === "…") { start = index + 1; continue; }
    if (char !== "?") continue;
    let last = index;
    while (last + 1 < text.length && (text[last + 1] === "?" || text[last + 1] === "!")) last += 1;
    let trimmedStart = start;
    while (trimmedStart < index && /\s/.test(text[trimmedStart])) trimmedStart += 1;
    let after = last + 1;
    while (after < text.length && text[after] === " ") after += 1;
    const opener = text[start - 1];
    const wholeQuote = quoteOpen && opener === "\"" && text[after] === "\"";
    const wholeStar = starOpen && opener === "*" && text[after] === "*";
    if (wholeQuote || wholeStar) {
      let end = after + 1;
      const tag = wholeQuote ? DIALOGUE_TAG.exec(text.slice(end)) : null;
      if (tag) end += tag[0].length;
      spans.push({ start: start - 1, end, whole: true, questionEnd: end });
      if (wholeQuote) quoteOpen = false;
      else starOpen = false;
      index = end - 1;
    } else {
      const closesNext = text[after] === "\"" || text[after] === "*" || text[after] === "\n" || after >= text.length;
      spans.push({ start: closesNext ? start : trimmedStart, end: closesNext ? last + 1 : after, whole: false, questionEnd: last + 1 });
      index = last;
    }
    start = index + 1;
  }
  return mergeFragments(text, spans);
};

export const countQuestions = (text: string): number => questionSpans(text).length;

export const keepLastQuestion = (text: string): KeepLastQuestionResult => {
  const source = typeof text === "string" ? text : "";
  const spans = questionSpans(source);
  if (spans.length === 1 && spans[0].fragment) {
    const span = spans[0];
    const joined = source.slice(0, span.start) + joinFragment(source.slice(span.start, span.end)) + source.slice(span.end);
    return { action: "trimmed", text: joined, questions: 1, removedWords: 0, joined: true };
  }
  if (spans.length < 2) return { action: "untouched", text: source, questions: spans.length };
  let kept = "";
  let at = 0;
  for (const span of spans.slice(0, -1)) {
    kept += source.slice(at, span.start);
    at = span.end;
  }
  const last = spans[spans.length - 1];
  const tail = last.fragment ? source.slice(at, last.start) + joinFragment(source.slice(last.start, last.end)) + source.slice(last.end) : source.slice(at);
  const out = tidy(kept + tail, /\n\s*\n/.test(source));
  const reasons: KeepLastQuestionReason[] = [];
  if (!out) reasons.push("empty");
  if (wordCount(out) < MIN_WORDS) reasons.push("too-short");
  if (!balanced(out)) reasons.push("unbalanced");
  if (questionSpans(out).length !== 1) reasons.push("question-count");
  if (reasons.length) return { action: "rejected", text: source, questions: spans.length, reasons };
  return { action: "trimmed", text: out, questions: spans.length, removedWords: wordCount(source) - wordCount(out) };
};

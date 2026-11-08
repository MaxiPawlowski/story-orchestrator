import { mentions, namesIn } from "./summaryGuard";

const QUOTED = /"[^"\n]*"|“[^”\n]*”/g;
const REFUSAL = new RegExp([
  "\\bI(?:'m|’m| am) (?:sorry|unable|not able)\\b",
  "\\bI (?:can(?:not|'t|’t)|won't|won’t|will not) (?:help|assist|summari[sz]e|comply|provide|continue|write|create|do that)\\b",
  "\\bas an AI\\b",
  "\\bagainst (?:my|the) (?:guidelines|content polic)",
].join("|"), "i");
const META = /\b(?:this|the) (?:passage|text|request|content|excerpt|conversation|transcript)\b/i;
const HEAD_CHARS = 400;

const recurring = (passage: string, vocabulary: readonly string[]): string[] => namesIn(passage, vocabulary)
  .filter((name) => passage.split(name).length > 2).slice(0, 8);

export function isRefusal(summary: string, passage: string, vocabulary: readonly string[] = []): boolean {
  if (/<declined>/i.test(summary)) return true;
  const outside = summary.replace(QUOTED, " ");
  if (REFUSAL.test(outside.slice(0, HEAD_CHARS))) return true;
  const names = recurring(passage, vocabulary);
  return names.length > 0 && META.test(outside) && !names.some((name) => mentions(summary, name));
}

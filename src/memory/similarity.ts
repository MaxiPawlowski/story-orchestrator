import { foldTerm } from "@utils/termPresent";

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function similarityTokens(text: string): Set<string> {
  const folded = foldTerm(String(text ?? "")).toLowerCase();
  return new Set(folded.split(/\s+/).map((token) => token.replace(EDGE_PUNCTUATION, "")).filter(Boolean));
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = similarityTokens(a);
  const setB = similarityTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  const overlap = [...setA].filter((word) => setB.has(word)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  return overlap / union;
}

export const STATE_CHANGE_PATTERNS: RegExp[] = [
  /\bno longer\b/i,
  /\bnot anymore\b/i,
  /\bno more\b/i,
  /\bcan no longer\b/i,
  /\bare now\b/i,
  /\bis now\b/i,
  /\bcan now\b/i,
  /\bnow \w/i,
  /\bformer(?:ly)?\b/i,
  /\bused to\b/i,
  /\bonce (?:was|were|believed?|thought|feared?|distrusted?|had)\b/i,
  /\bhas since\b/i,
  /\bbecame\b/i,
  /\bstopped\b/i,
  /\bswitched (?:to|from)\b/i,
  /\bmoved (?:to|away|from|out)\b/i,
  /\breconciled\b/i,
  /\bseparated\b/i,
  /\bended the\b/i,
  /\bbroke up\b/i,
  /\bhealed\b/i,
  /\brecovered\b/i,
  /\blost (?:her|his|their|the|a|an|my)\b/i,
  /\bstole (?:her|his|their|the|a|an|my)\b/i,
  /\bdestroyed\b/i,
  /\bburned down\b/i,
  /\bjoined (?:the|a|an)\b/i,
  /\bleft (?:the|a|an)\b/i,
  /\bdefected\b/i,
  /\babandoned (?:the|a|an|her|his|their)\b/i,
  /\bwas (?:killed|murdered|captured|freed|released|exiled|banished|promoted|demoted|betrayed|stolen|destroyed|burned|lost)\b/i,
  /\bhas (?:died|been (?:killed|captured|freed|released|exiled|banished|promoted|demoted|stolen|destroyed))\b/i,
];

export function hasStateChangeMarker(text: string): boolean {
  return STATE_CHANGE_PATTERNS.some((pattern) => pattern.test(text));
}

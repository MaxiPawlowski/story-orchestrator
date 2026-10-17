export type TermMode = "term" | "prefix";

export const TERM_SCORER_VERSION = 2;

const FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, "\""],
  [/[‒–—―−]/g, "-"],
];

export const foldTerm = (text: string): string => FOLDS.reduce((folded, [pattern, to]) => folded.replace(pattern, to), text.normalize("NFKC"));

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const WORD_EDGE = /[\p{L}\p{N}]/u;

export const termPresent = (haystack: string, needle: string, mode: TermMode = "term"): boolean => {
  const target = foldTerm(needle);
  if (!target) return true;
  const head = WORD_EDGE.test(target.charAt(0)) ? "(?<![\\p{L}\\p{N}])" : "";
  const tail = mode === "term" && WORD_EDGE.test(target.charAt(target.length - 1)) ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`${head}${escapeRegExp(target)}${tail}`, "iu").test(foldTerm(haystack));
};

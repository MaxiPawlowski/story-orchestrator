import type { DerivedRecord } from "./derived";
import type { ArcEntry } from "./types";
import { contentWords, restatesWords, wordOverlap } from "./words";

const EXCLUDED_THREAD_OVERLAP = 0.45;

export const excludedTexts = (derived: readonly DerivedRecord[] = []): string[] =>
  derived.filter((record) => record.kind === "exclusion").flatMap((record) => (record.removed ?? []).map((entry) => entry.text));

function restatesExcluded(text: string, excluded: readonly string[]): boolean {
  const words = contentWords(text);
  return excluded.some((fact) => {
    const factWords = contentWords(fact);
    return restatesWords(factWords, words) || restatesWords(words, factWords) || wordOverlap(words, factWords) >= EXCLUDED_THREAD_OVERLAP;
  });
}

export function withoutExcludedThreads(arcs: ArcEntry[], derived?: readonly DerivedRecord[]): ArcEntry[] {
  const excluded = excludedTexts(derived);
  return excluded.length ? arcs.filter((arc) => arc.pinned || arc.status !== "open" || !restatesExcluded(arc.text, excluded)) : arcs;
}

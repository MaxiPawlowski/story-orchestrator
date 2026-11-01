import type { LoreEntry } from "@judge/lore";
import { loreKey } from "@judge/lore";
import { fnv1a } from "./hash";

export interface LoreLexicalOptions {
  fallback: boolean;
  prefilter: boolean;
  tiebreak: boolean;
  hold: boolean;
  preferKnown: boolean;
}

export const NO_LEXICAL: LoreLexicalOptions = { fallback: false, prefilter: false, tiebreak: false, hold: false, preferKnown: false };

export interface LexicalPlanInput {
  options?: LoreLexicalOptions;
  rated: LoreEntry[];
  candidates: LoreEntry[];
  keysOf: (candidate: LoreEntry) => string[];
  window: Array<{ speaker: string; text: string }>;
  terms: string[];
  sceneKey: string;
  playerTurn: number | null;
  holdParts: () => Array<string | number>;
  unknown?: () => Promise<string[]>;
}

export interface LexicalPlan {
  scoreKey: string;
  tiebreak?: ReadonlyMap<string, number>;
  adjust: (candidate: LoreEntry, p: number) => number;
  prefilter: (known: Map<string, number | null>) => void;
  fallback: (topK: number, silent: boolean) => LoreEntry[] | null;
}

export const identityPlan = (sceneKey: string): LexicalPlan => ({ scoreKey: sceneKey, adjust: (_candidate, p) => p, prefilter: () => undefined, fallback: () => null });

export async function lexicalPlan(input: LexicalPlanInput): Promise<LexicalPlan> {
  const options = input.options ?? NO_LEXICAL;
  if (!Object.values(options).some(Boolean)) return identityPlan(input.sceneKey);
  const lexical = await import("@judge/loreLexical");
  const asLexical = (candidate: LoreEntry) => ({ ...candidate, keys: input.keysOf(candidate) });
  const ranked = lexical.lexicalRank(input.rated.map(asLexical), { window: input.window, terms: input.terms });
  const named = () => fnv1a(lexical.namedEntries(input.candidates.map(asLexical), input.window).join("|"));
  const held = options.hold && input.playerTurn !== null ? ["hold", ...input.holdParts(), input.playerTurn, named()].join(":") : null;
  const unknown = options.preferKnown ? (await input.unknown?.()) ?? [] : [];
  return {
    scoreKey: held ?? input.sceneKey,
    ...(options.tiebreak ? { tiebreak: lexical.lexicalScores(ranked) } : {}),
    adjust: (candidate, p) => (unknown.length && lexical.aboutUnknown(asLexical(candidate), unknown) ? Math.max(0, p - lexical.UNKNOWN_ENTITY_PENALTY) : p),
    prefilter: (known) => {
      if (!options.prefilter || input.rated.length <= lexical.LEXICAL_PREFILTER) return;
      const pool = new Set(lexical.lexicalPool(ranked).map(loreKey));
      for (const candidate of input.rated) if (!pool.has(loreKey(candidate)) && !known.has(loreKey(candidate))) known.set(loreKey(candidate), null);
    },
    fallback: (topK, silent) => (options.fallback && silent
      ? lexical.lexicalFallback(ranked, { picks: Math.min(lexical.LEXICAL_FALLBACK_PICKS, topK), unknown }).map((row) => row.entry)
      : null),
  };
}

// Ranking metrics for lore selection, defined before the comparison run so the
// numbers cannot be chosen to fit the answer. `recall`/`precision` (the pair) say whether the
// right entries came back at all; these say whether the ORDER was any good, which is what a Score
// over described relevance levels is supposed to improve — and the tie rate says how much of today's
// order is decided by insertion order rather than by the model.
export const RELEVANCE_LEVELS = ["irrelevant", "background", "useful", "needed"] as const;
export type LoreRelevance = (typeof RELEVANCE_LEVELS)[number];

export const relevanceRank = (level: LoreRelevance): number => RELEVANCE_LEVELS.indexOf(level);

export interface LoreRankedPick {
  key: string;
  score: number;
}

export interface LoreRankTurn {
  id: string;
  /** The arm's own filtered, sorted picks, best first. */
  ranked: LoreRankedPick[];
  /** Every entry the arm considered, so a relevant entry it dropped is a miss and not an absence. */
  considered: string[];
  labels: Record<string, LoreRelevance>;
}

export interface LoreRankingMetrics {
  turns: number;
  /** Fraction of the top 4 that are `useful` or `needed`. Turns that picked nothing are skipped. */
  precisionAt4: number | null;
  /**
   * Fraction of turns whose top 4 was partly ordered by insertion order: two of the top FIVE share a
   * score, so uid decided which of them the reply actually got. Counting only ties *inside* the top 4
   * would miss the common case, where the tie is at the cut and uid picks the winner.
   */
  tieRate: number | null;
  /** The same tie narrowed to the 4th and 5th candidate, which is where it changes the answer. */
  boundaryTieRate: number | null;
  /** Graded, over the four ordered levels. Turns with nothing relevant to find are skipped. */
  ndcgAt4: number | null;
  /** Mean characters of the state the arm sent per turn — the context-rot question. */
  meanStateChars: number | null;
}

export const RANKING_CUTOFF = 4;

const isRelevant = (level: LoreRelevance | undefined): boolean => level === "useful" || level === "needed";

const mean = (values: number[]): number | null => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

const round = (value: number | null): number | null => (value === null ? null : Number(value.toFixed(4)));

const dcg = (levels: Array<LoreRelevance | undefined>): number =>
  levels.slice(0, RANKING_CUTOFF).reduce((sum, level, index) => sum + (2 ** relevanceRank(level ?? "irrelevant") - 1) / Math.log2(index + 2), 0);

export function rankingMetrics(turns: LoreRankTurn[]): LoreRankingMetrics {
  const precision: number[] = [];
  const ties: number[] = [];
  const boundaryTies: number[] = [];
  const ndcg: number[] = [];
  for (const turn of turns) {
    const top = turn.ranked.slice(0, RANKING_CUTOFF);
    if (top.length) precision.push(top.filter((pick) => isRelevant(turn.labels[pick.key])).length / Math.min(RANKING_CUTOFF, top.length));
    const withCut = turn.ranked.slice(0, RANKING_CUTOFF + 1);
    if (withCut.length >= 2) ties.push(withCut.some((pick, index) => withCut.some((other, otherIndex) => otherIndex > index && other.score === pick.score)) ? 1 : 0);
    if (turn.ranked.length >= RANKING_CUTOFF + 1) boundaryTies.push(turn.ranked[RANKING_CUTOFF - 1].score === turn.ranked[RANKING_CUTOFF].score ? 1 : 0);
    const ideal = turn.considered.map((key) => turn.labels[key]).sort((left, right) => relevanceRank(right ?? "irrelevant") - relevanceRank(left ?? "irrelevant"));
    const best = dcg(ideal);
    if (best > 0) ndcg.push(dcg(top.map((pick) => turn.labels[pick.key])) / best);
  }
  return {
    turns: turns.length,
    precisionAt4: round(mean(precision)),
    tieRate: round(mean(ties)),
    boundaryTieRate: round(mean(boundaryTies)),
    ndcgAt4: round(mean(ndcg)),
    meanStateChars: null,
  };
}

// The plan's floors (A), declared here rather than at the call site so a run cannot pick its own bar.
export const LORE_RANKING_FLOORS = { precisionAt4: 0.85, tieRate: 0.05 } as const;

export const loreRankingVerdict = (metrics: LoreRankingMetrics): { precisionAt4: boolean; tieRate: boolean; ok: boolean } => {
  const precisionAt4 = (metrics.precisionAt4 ?? 0) >= LORE_RANKING_FLOORS.precisionAt4;
  const tieRate = (metrics.tieRate ?? 1) <= LORE_RANKING_FLOORS.tieRate;
  return { precisionAt4, tieRate, ok: precisionAt4 && tieRate };
};

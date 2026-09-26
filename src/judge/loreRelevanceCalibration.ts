import { buildLoreRequests, loreKey, readLore, type LoreEntry, type LoreScene } from "./lore";
import { buildLoreScoreRequests, readLoreScores } from "./loreScore";
import { RANKING_CUTOFF, rankingMetrics, type LoreRankTurn, type LoreRankingMetrics, type LoreRelevance } from "./loreRanking";
import type { JudgeAnswer, JudgeRequest, JudgeResult } from "./types";

// v2.3 plan 10 (A): Noul-sort against Score-sort over the same rows and the same labels. The two arms
// are asked in the same turn, from the same state, so a difference is the question shape and nothing
// else. Ordering only — no `min_p` on either arm — because the question here is which arm orders
// better, and a per-arm floor would change which entries are being compared.
export interface LoreRelevanceCase {
  id: string;
  lang: string;
  pool: string;
  scene: LoreScene;
  /** Absent until the pooled candidates are labelled; see the fixture's `labellingRule`. */
  labels?: Record<string, LoreRelevance>;
  candidates?: LoreEntry[];
}

export interface LoreRelevanceFixture {
  pools: Record<string, LoreEntry[]>;
  rows: LoreRelevanceCase[];
}

export const resolveRelevanceCases = (fixture: LoreRelevanceFixture): LoreRelevanceCase[] =>
  fixture.rows.map((row) => ({ ...row, candidates: row.candidates ?? fixture.pools[row.pool] ?? [] }));

export interface LoreArmReport extends LoreRankingMetrics {
  arm: "noul" | "score";
  /** What each arm put in its top 4, so a disagreement can be read rather than only counted. */
  top: Array<{ id: string; picks: Array<{ key: string; score: number; label: LoreRelevance | null }> }>;
}

/**
 * One request and the answer it got, reduced to a key. The state and the questions are reconstructed
 * from the fixture by whoever replays this, so storing them again would quadruple the golden for
 * nothing; the key is what proves the replay asked the same question.
 */
export interface LoreRelevanceExchange {
  arm: "noul" | "score";
  key: number;
  questionCount: number;
  answers: Record<string, JudgeAnswer>;
}

// A recorded answer keeps only what the readers read: the score question's probability map is a
// thousand times the size of the number it produces, and it is what makes a golden unshippable.
const slimAnswers = (answers: Record<string, JudgeAnswer>): Record<string, JudgeAnswer> =>
  Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id,
    answer.type === "score" ? { type: "score", score: answer.score, confidence: answer.confidence, probabilities: {} }
      : answer.type === "noul" ? { type: "noul", noul: answer.noul }
        : { type: "choice", choice: answer.choice, confidence: answer.confidence, probabilities: {} },
  ]));

export const requestKey = (state: unknown, questions: unknown): number => {
  const text = JSON.stringify([state, questions]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};

export interface LoreRelevanceReport {
  ranAt: string;
  model: string | null;
  noul: LoreArmReport;
  score: LoreArmReport;
  /** How many rows each arm put a different entry in its top 4 for — the disagreement count. */
  disagreements: number;
  /** Every request and answer, so the measurement replays in jest without the judge. */
  exchanges: LoreRelevanceExchange[];
}

// One past the cut, because the 5th entry is what the 4th is tied with and that is the tie that
// decides the answer.
const sortArm = (scored: Array<{ entry: LoreEntry; score: number }>): LoreRankTurn["ranked"] =>
  [...scored].sort((left, right) => right.score - left.score || left.entry.uid - right.entry.uid).slice(0, RANKING_CUTOFF + 1).map((pick) => ({ key: loreKey(pick.entry), score: pick.score }));

// Ties are label-free, so they are computed over every row; precision and nDCG need labels, so they
// are computed over the labelled rows only. Mixing the two would report a precision over rows nobody
// has agreed on yet as if it were a measurement.
const mergeMetrics = (all: LoreRankingMetrics, labelled: LoreRankingMetrics): LoreRankingMetrics => ({
  turns: all.turns,
  precisionAt4: labelled.precisionAt4,
  ndcgAt4: labelled.ndcgAt4,
  tieRate: all.tieRate,
  boundaryTieRate: all.boundaryTieRate,
  meanStateChars: all.meanStateChars,
});

export async function runLoreRelevanceCalibration(
  ask: (request: JudgeRequest) => Promise<JudgeResult>,
  cases: LoreRelevanceCase[],
): Promise<LoreRelevanceReport> {
  const perCase = await Promise.all(cases.map(async (entry) => {
    const candidates = entry.candidates ?? [];
    const noulChunks = buildLoreRequests(candidates, entry.scene);
    const scoreChunks = buildLoreScoreRequests(candidates, entry.scene);
    const [noulResults, scoreResults] = await Promise.all([
      Promise.all(noulChunks.map(async (chunk) => ({ chunk, result: await ask(chunk.request) }))),
      Promise.all(scoreChunks.map(async (chunk) => ({ chunk, result: await ask(chunk.request) }))),
    ]);
    const noulScored = noulResults.flatMap(({ chunk, result }) => (result.answers ? readLore(result.answers, chunk.entries).map((pick) => ({ entry: pick.entry, score: pick.p })) : []));
    const scoreScored = scoreResults.flatMap(({ chunk, result }) => (result.answers ? readLoreScores(result.answers, chunk.entries).map((pick) => ({ entry: pick.entry, score: pick.level })) : []));
    const exchanges: LoreRelevanceExchange[] = [
      ...noulResults.map(({ chunk, result }) => ({ arm: "noul" as const, chunk, result })),
      ...scoreResults.map(({ chunk, result }) => ({ arm: "score" as const, chunk, result }))
    ]
      .flatMap(({ arm, chunk, result }) => (result.answers ? [{
        arm,
        key: requestKey(chunk.request.state, chunk.request.questions),
        questionCount: Object.keys(chunk.request.questions).length,
        answers: slimAnswers(result.answers),
      }] : []));
    const considered = candidates.map(loreKey);
    const labels = entry.labels ?? {};
    const model = [...noulResults, ...scoreResults].find(({ result }) => result.model)?.result.model ?? null;
    const stateChars = [...noulResults, ...scoreResults].reduce((sum, { result }) => sum + result.stateChars, 0);
    return { id: entry.id, labels, considered, noul: sortArm(noulScored), score: sortArm(scoreScored), model, stateChars, exchanges };
  }));

  const armReport = (arm: "noul" | "score"): LoreArmReport => {
    const turns: LoreRankTurn[] = perCase.map((entry) => ({ id: entry.id, ranked: entry[arm], considered: entry.considered, labels: entry.labels }));
    const labelled = turns.filter((turn) => Object.keys(turn.labels).length > 0);
    const metrics = mergeMetrics(rankingMetrics(turns), rankingMetrics(labelled));
    metrics.meanStateChars = Number((perCase.reduce((sum, entry) => sum + entry.stateChars, 0) / Math.max(1, perCase.length)).toFixed(1));
    return {
      arm,
      ...metrics,
      top: perCase.map((entry) => ({ id: entry.id, picks: entry[arm].map((pick) => ({ ...pick, label: entry.labels[pick.key] ?? null })) })),
    };
  };

  const noul = armReport("noul");
  const score = armReport("score");
  return {
    ranAt: new Date().toISOString(),
    model: perCase.find((entry) => entry.model)?.model ?? null,
    noul,
    score,
    disagreements: perCase.filter((entry) => entry.noul.map((pick) => pick.key).join() !== entry.score.map((pick) => pick.key).join()).length,
    exchanges: perCase.flatMap((entry) => entry.exchanges),
  };
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLoreRequests, loreKey, pickLore, readLore, type LoreEntry, type LorePick, type LoreScene } from "./lore";
import { requestKey, resolveRelevanceCases, type LoreRelevanceFixture } from "./loreRelevanceCalibration";
import { resolveLoreCases, type LoreCalibrationFixture } from "./loreCalibration";
import { RANKING_CUTOFF, rankingMetrics, type LoreRankTurn, type LoreRelevance } from "./loreRanking";
import { LEXICAL_PREFILTER, lexicalFallback, lexicalPool, lexicalRank, lexicalScores } from "./loreLexical";
import type { JudgeAnswer } from "./types";
import { loreStateTerms } from "./loreState";

const NARRATORS = new Set(["narrator", "dm", "dm narrator", "system"]);
const offlineState = (scene: LoreScene) => loreStateTerms({
  cast: [...new Set(scene.window.map((line) => line.speaker.trim()).filter((speaker) => speaker && !NARRATORS.has(speaker.toLowerCase())))].map((name) => ({ name, aliases: [] })),
  quests: [scene.objective], known: [],
});

const read = <T>(path: string): T => JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as T;

const relevanceFixture = (): LoreRelevanceFixture => {
  const own = read<LoreRelevanceFixture & { poolsFrom?: string }>("test/fixtures/judge/lore-relevance.json");
  const source = own.poolsFrom ? read<{ pools: LoreRelevanceFixture["pools"] }>(`test/fixtures/judge/${own.poolsFrom}`) : null;
  return { pools: { ...(own.pools ?? {}), ...(source?.pools ?? {}) }, rows: own.rows };
};

const relevanceAnswers = () => {
  const golden = read<{ calls: Array<{ arm: string; key: number; answers: Record<string, JudgeAnswer> }> }>("test/goldens/judge/lore-relevance.json");
  return new Map(golden.calls.filter((call) => call.arm === "noul").map((call) => [call.key, call.answers]));
};

const calibrationAnswers = () => {
  const golden = read<{ calls: Array<{ state: unknown; questions: Record<string, unknown>; answers: Record<string, JudgeAnswer> }> }>("test/goldens/judge/lore.json");
  return new Map(golden.calls.flatMap((call) => Object.entries(call.questions).map(([id, question]) => [JSON.stringify([call.state, question]), call.answers[id]] as const)));
};

const judgeP = (candidates: LoreEntry[], scene: LoreScene, answer: (state: unknown, questions: Record<string, unknown>) => Record<string, JudgeAnswer> | null): LorePick[] =>
  buildLoreRequests(candidates, scene).flatMap((chunk) => {
    const answers = answer(chunk.request.state, chunk.request.questions as Record<string, unknown>);
    if (!answers) throw new Error("golden has no answer for this request");
    return readLore(answers, chunk.entries);
  });

const ranked = (rows: Array<{ entry: LoreEntry; score: number }>) => rows.slice(0, RANKING_CUTOFF + 1).map((row) => ({ key: loreKey(row.entry), score: row.score }));

const byJudge = (picks: LorePick[], tiebreak?: Map<string, number>) => [...picks]
  .sort((left, right) => right.p - left.p || (tiebreak ? (tiebreak.get(loreKey(right.entry)) ?? 0) - (tiebreak.get(loreKey(left.entry)) ?? 0) : 0) || left.entry.uid - right.entry.uid);

const tieScored = (picks: LorePick[], tiebreak?: Map<string, number>) => {
  const order = byJudge(picks, tiebreak);
  return order.map((pick, index) => ({ entry: pick.entry, score: tiebreak ? Number((pick.p + (order.length - index) * 1e-6).toFixed(7)) : pick.p }));
};

const round = (value: number) => Number(value.toFixed(4));

const report: Record<string, unknown> = {};

afterAll(() => {
  process.stdout.write(`\nG5 lexical arm: ${JSON.stringify(report)}\n`);
});

describe("BM25 lexical arm, offline (plan 42a G5)", () => {
  it("lore-relevance: lexical, judge, judge+tiebreak and the capped pool against the graded labels", () => {
    const answers = relevanceAnswers();
    const cases = resolveRelevanceCases(relevanceFixture());
    const turns: Record<"judge" | "lexical" | "lexicalState" | "tiebreak" | "capped" | "cappedState", LoreRankTurn[]> = { judge: [], lexical: [], lexicalState: [], tiebreak: [], capped: [], cappedState: [] };
    let neededHit = 0;
    let neededHitState = 0;
    let judgePicksInStatePool = 0;
    let needed = 0;
    let judgePicks = 0;
    let judgePicksInPool = 0;
    for (const entry of cases) {
      const candidates = entry.candidates ?? [];
      const labels = entry.labels ?? {} as Record<string, LoreRelevance>;
      const considered = candidates.map(loreKey);
      const picks = judgeP(candidates, entry.scene, (state, questions) => answers.get(requestKey(state, questions)) ?? null);
      const lexical = lexicalRank(candidates, { window: entry.scene.window });
      const scores = lexicalScores(lexical);
      const pool = new Set(lexicalPool(lexical).map(loreKey));
      const stated = lexicalRank(candidates, { window: entry.scene.window, terms: offlineState(entry.scene) });
      const statePool = new Set(lexicalPool(stated).map(loreKey));
      turns.lexicalState.push({ id: entry.id, ranked: ranked(stated), considered, labels });
      turns.cappedState.push({ id: entry.id, ranked: ranked(tieScored(picks.filter((pick) => statePool.has(loreKey(pick.entry))))), considered, labels });
      turns.judge.push({ id: entry.id, ranked: ranked(tieScored(picks)), considered, labels });
      turns.tiebreak.push({ id: entry.id, ranked: ranked(tieScored(picks, scores)), considered, labels });
      turns.lexical.push({ id: entry.id, ranked: ranked(lexical), considered, labels });
      turns.capped.push({ id: entry.id, ranked: ranked(tieScored(picks.filter((pick) => pool.has(loreKey(pick.entry))))), considered, labels });
      const top = new Set(lexical.slice(0, RANKING_CUTOFF).map((row) => loreKey(row.entry)));
      const want = (entry as { needed?: string[] }).needed ?? [];
      needed += want.length;
      neededHit += want.filter((key) => top.has(key)).length;
      const topState = new Set(stated.slice(0, RANKING_CUTOFF).map((row) => loreKey(row.entry)));
      neededHitState += want.filter((key) => topState.has(key)).length;
      const chosen = pickLore(picks, {});
      judgePicks += chosen.length;
      judgePicksInPool += chosen.filter((pick) => pool.has(loreKey(pick.entry))).length;
      judgePicksInStatePool += chosen.filter((pick) => statePool.has(loreKey(pick.entry))).length;
    }
    const metrics = Object.fromEntries(Object.entries(turns).map(([arm, rows]) => [arm, rankingMetrics(rows)]));
    const relevance = {
      rows: cases.length, metrics,
      lexicalNeededRecallAt4: round(neededHit / Math.max(1, needed)), lexicalStateNeededRecallAt4: round(neededHitState / Math.max(1, needed)),
      prefilterJudgePickRecall: round(judgePicksInPool / Math.max(1, judgePicks)), prefilterStateJudgePickRecall: round(judgePicksInStatePool / Math.max(1, judgePicks)),
      judgePicks, pool: LEXICAL_PREFILTER,
    };
    report.relevance = relevance;
    expect(cases.length).toBe(17);
    expect(metrics.judge.ndcgAt4).not.toBeNull();
  });

  it("lore.json: lexical recall@2 and the capped pool's calibration recall", () => {
    const answers = calibrationAnswers();
    const fixture = read<LoreCalibrationFixture & { floors: Record<string, number> }>("test/fixtures/judge/lore.json");
    const cases = resolveLoreCases(fixture);
    let hits2 = 0;
    let hits2State = 0;
    let cappedStateRecall = 0;
    let possible2 = 0;
    let fallbackHits = 0;
    let fallbackPicks = 0;
    let fullRecall = 0;
    let cappedRecall = 0;
    let needed = 0;
    for (const entry of cases) {
      const candidates = entry.candidates ?? [];
      const picks = judgeP(candidates, entry.scene, (state, questions) => {
        const rows = Object.entries(questions).map(([id, question]) => [id, answers.get(JSON.stringify([state, question]))] as const);
        return rows.every(([, answer]) => answer) ? Object.fromEntries(rows) as Record<string, JudgeAnswer> : null;
      });
      const want = new Set(entry.needed);
      const lexical = lexicalRank(candidates, { window: entry.scene.window });
      hits2 += lexical.slice(0, 2).filter((row) => want.has(loreKey(row.entry))).length;
      const stated = lexicalRank(candidates, { window: entry.scene.window, terms: offlineState(entry.scene) });
      hits2State += stated.slice(0, 2).filter((row) => want.has(loreKey(row.entry))).length;
      const statePool = new Set(lexicalPool(stated).map(loreKey));
      cappedStateRecall += pickLore(picks.filter((pick) => statePool.has(loreKey(pick.entry))), {}).filter((pick) => want.has(loreKey(pick.entry))).length;
      possible2 += Math.min(2, want.size);
      const fallback = lexicalFallback(lexical);
      fallbackPicks += fallback.length;
      fallbackHits += fallback.filter((row) => want.has(loreKey(row.entry))).length;
      const pool = new Set(lexicalPool(lexical).map(loreKey));
      needed += want.size;
      fullRecall += pickLore(picks, {}).filter((pick) => want.has(loreKey(pick.entry))).length;
      cappedRecall += pickLore(picks.filter((pick) => pool.has(loreKey(pick.entry))), {}).filter((pick) => want.has(loreKey(pick.entry))).length;
    }
    report.calibration = {
      rows: cases.length, lexicalRecallAt2: round(hits2 / Math.max(1, possible2)), lexicalStateRecallAt2: round(hits2State / Math.max(1, possible2)),
      judgeRecallCappedState: `${cappedStateRecall}/${needed}`,
      fallbackPrecision: round(fallbackHits / Math.max(1, fallbackPicks)), fallbackPicks,
      judgeRecallFull: `${fullRecall}/${needed}`, judgeRecallCapped: `${cappedRecall}/${needed}`,
    };
    expect(cases.length).toBe(11);
  });
});

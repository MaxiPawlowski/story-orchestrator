import { LORE_RANKING_FLOORS, loreRankingVerdict, rankingMetrics, relevanceRank, type LoreRankTurn } from "./loreRanking";
import { buildLoreScoreRequests, LORE_RELEVANCE_SCALE, readLoreScores, scaleToLevel, scoreToLevel } from "./loreScore";
import { LORE_CHUNK } from "./policy";
import { validateJudgeRequest } from "./questions";
import type { JudgeAnswer } from "./types";
import type { LoreEntry } from "./lore";

const turn = (id: string, ranked: Array<[string, number]>, labels: Record<string, "irrelevant" | "background" | "useful" | "needed">, considered?: string[]): LoreRankTurn => ({
  id,
  ranked: ranked.map(([key, score]) => ({ key, score })),
  labels,
  considered: considered ?? Object.keys(labels),
});

describe("lore ranking metrics (v2.3 plan 10 A)", () => {
  it("orders the four levels, irrelevant first", () => {
    expect(["irrelevant", "background", "useful", "needed"].map((level) => relevanceRank(level as never))).toEqual([0, 1, 2, 3]);
  });

  it("scores precision@4 over the top 4, counting only useful and needed", () => {
    const metrics = rankingMetrics([
      turn("a", [["k1", 0.9], ["k2", 0.8], ["k3", 0.7], ["k4", 0.6], ["k5", 0.5]], { k1: "needed", k2: "useful", k3: "background", k4: "irrelevant", k5: "needed" }),
      turn("b", [["k1", 0.9], ["k2", 0.8], ["k3", 0.7], ["k4", 0.6]], { k1: "needed", k2: "needed", k3: "useful", k4: "useful" }),
    ]);
    expect(metrics.precisionAt4).toBe(0.75);
    expect(metrics.turns).toBe(2);
  });

  it("does not reward a short list with a small denominator", () => {
    const metrics = rankingMetrics([turn("a", [["k1", 0.9]], { k1: "needed", k2: "needed" })]);
    expect(metrics.precisionAt4).toBe(1);
    expect(rankingMetrics([turn("b", [["k1", 0.9]], { k1: "irrelevant", k2: "needed" })]).precisionAt4).toBe(0);
  });

  it("counts a tie inside the top 4 and the boundary tie separately", () => {
    const inside = [turn("a", [["k1", 0.9], ["k2", 0.9], ["k3", 0.7], ["k4", 0.6], ["k5", 0.5]], {})];
    const boundary = [turn("b", [["k1", 0.9], ["k2", 0.8], ["k3", 0.7], ["k4", 0.6], ["k5", 0.6]], {})];
    expect(rankingMetrics(inside).tieRate).toBe(1);
    expect(rankingMetrics(inside).boundaryTieRate).toBe(0);
    expect(rankingMetrics(boundary).tieRate).toBe(1);
    expect(rankingMetrics(boundary).boundaryTieRate).toBe(1);
    expect(rankingMetrics([turn("c", [["k1", 0.9], ["k2", 0.8], ["k3", 0.7], ["k4", 0.6], ["k5", 0.5]], {})]).tieRate).toBe(0);
  });

  it("scores nDCG@4 against the best ordering the row could have had, and skips a row with nothing to find", () => {
    const perfect = rankingMetrics([turn("a", [["k1", 1], ["k2", 1], ["k3", 1], ["k4", 1]], { k1: "needed", k2: "useful", k3: "background", k4: "irrelevant" })]);
    expect(perfect.ndcgAt4).toBe(1);
    const reversed = rankingMetrics([turn("b", [["k1", 1], ["k2", 1], ["k3", 1], ["k4", 1]], { k1: "irrelevant", k2: "background", k3: "useful", k4: "needed" })]);
    expect(reversed.ndcgAt4).toBeLessThan(0.6);
    // Graded, so a row whose best entry is only `background` still has a gain to find and can be
    // ranked perfectly. Null is only for a row where nothing at all carries relevance.
    expect(rankingMetrics([turn("c", [["k1", 1]], { k1: "background", k2: "irrelevant" })]).ndcgAt4).toBe(1);
    expect(rankingMetrics([turn("d", [["k1", 1]], { k1: "irrelevant", k2: "irrelevant" })]).ndcgAt4).toBeNull();
  });

  it("applies the predeclared floors to the two metrics that carry them", () => {
    expect(LORE_RANKING_FLOORS).toEqual({ precisionAt4: 0.85, tieRate: 0.05 });
    expect(loreRankingVerdict({ turns: 1, precisionAt4: 0.85, tieRate: 0.05, boundaryTieRate: 0, ndcgAt4: 0.9, meanStateChars: null }).ok).toBe(true);
    expect(loreRankingVerdict({ turns: 1, precisionAt4: 0.84, tieRate: 0.05, boundaryTieRate: 0, ndcgAt4: 0.9, meanStateChars: null }).ok).toBe(false);
    expect(loreRankingVerdict({ turns: 1, precisionAt4: 1, tieRate: 0.06, boundaryTieRate: 0, ndcgAt4: 0.9, meanStateChars: null }).ok).toBe(false);
    expect(loreRankingVerdict({ turns: 0, precisionAt4: null, tieRate: null, boundaryTieRate: null, ndcgAt4: null, meanStateChars: null }).ok).toBe(false);
  });
});

describe("lore Score arm (v2.3 plan 10 A)", () => {
  const entry = (uid: number, patch: Partial<LoreEntry> = {}): LoreEntry => ({ world: "Story Lore", uid, comment: `Entry ${uid}`, content: `Content ${uid}`, ...patch });
  const scene = { checkpointName: "The Guild", objective: "Sign up.", window: [{ speaker: "Max", text: "Who is the receptionist?" }] };

  it("asks one described Score per entry over the same scene state as the Noul arm", () => {
    const many = Array.from({ length: LORE_CHUNK + 1 }, (_, index) => entry(index));
    const chunks = buildLoreScoreRequests(many, scene);
    expect(chunks.map((chunk) => chunk.entries.length)).toEqual([LORE_CHUNK, 1]);
    expect(chunks[0].request.state).toEqual({ scene: { name: "The Guild", goal: "Sign up." }, transcript: [{ id: "msg_1", speaker: "Max", text: "Who is the receptionist?" }] });
    expect(chunks[0].request.questions["e:0"]).toMatchObject({ type: "score", criteria: [...LORE_RELEVANCE_SCALE] });
    chunks.forEach((chunk) => expect(validateJudgeRequest(chunk.request)).toEqual([]));
  });

  it("reads the answer index as the level, coarsely for the labels and finely for the ranking", () => {
    const answers: Record<string, JudgeAnswer> = {
      "e:0": { type: "score", score: 5, confidence: 0.9, probabilities: {} },
      "e:1": { type: "score", score: 4, confidence: 0.8, probabilities: {} },
      "e:2": { type: "score", score: 3, confidence: 0.8, probabilities: {} },
      "e:3": { type: "score", score: 1, confidence: 0.8, probabilities: {} },
      "e:4": { type: "score", score: 0, confidence: 0.8, probabilities: {} },
    };
    const scored = readLoreScores(answers, [entry(0), entry(1), entry(2), entry(3), entry(4), entry(5)]);
    expect(scored.map((pick) => [pick.level, pick.label])).toEqual([[5, "needed"], [4, "useful"], [3, "background"], [1, "background"], [0, "irrelevant"]]);
    expect(readLoreScores({}, [entry(0)])).toEqual([]);
    expect([scoreToLevel(-3), scoreToLevel(9)]).toEqual([0, 5]);
    expect([scaleToLevel(5), scaleToLevel(2)]).toEqual(["needed", "background"]);
  });
});

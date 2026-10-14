import { armA, armB, armC, armD, armE, checkOrder, e0ChoicePick, e0ChoiceRequest, E0_CHOICE_KEY, rankByScore, type E0Candidate, type E0PoolQuestion } from "./e0Ranking";
import { decideE0, runArm, scoreRankings, type E0ArmMetrics, type E0ArmResult } from "./e0Score";

const candidate = (messageId: number, stRank: number, text = `line ${messageId}`, bands: number[] = []): E0Candidate => ({ messageId, stRank, text, textHash: `h${messageId}`, bands });

const question = (overrides: Partial<E0PoolQuestion> = {}): E0PoolQuestion => ({
  id: "q1",
  askMessageId: 100,
  query: "what did tobin promise about the axle",
  gold: [30],
  candidates: [10, 20, 30, 40, 50, 60, 70, 80].map((id, rank) => candidate(id, rank, `line ${id}`, rank < 2 ? [0.82, 0.7, 0.55, 0.4] : rank < 5 ? [0.55, 0.4] : [])),
  ...overrides,
});

const metrics = (hitAt4: number, mrrAt4: number, poolRecall = 0.9): E0ArmMetrics => ({
  questions: 40, hits1: 0, hits4: Math.round(hitAt4 * 40), inPool: Math.round(poolRecall * 40), ties: 0,
  hitAt1: 0, hitAt4, mrrAt4, poolRecall, tieRate: 0, callsPerQuestion: 0, latencyP50: null, latencyP95: null, inputTokensPerQuestion: 0,
});

const result = (arm: E0ArmResult["arm"], value: E0ArmMetrics | null, owed: string | null = null): E0ArmResult => ({ arm, label: arm, metrics: value, owed, refused: [] });

describe("E0 arms (v2.8 21 §6.1)", () => {
  it("tie rule: equal scores fall back to ST order, then message id", () => {
    const ranked = rankByScore([candidate(9, 2), candidate(3, 1), candidate(5, 1), candidate(7, 0)], () => 1);
    expect(ranked.order).toEqual([7, 3, 5, 9]);
  });

  it("band arms reproduce ST order when bands are prefixes, and differ only in tie rate", () => {
    const pool = question();
    expect(armA(pool).order).toEqual(armE(pool).order);
    expect(armB(pool).order).toEqual(armE(pool).order);
    expect(armA(pool).scores.slice(0, 5)).toEqual([2, 2, 1, 1, 1]);
    expect(new Set(armE(pool).scores).size).toBe(8);
  });

  it("band arms score a non-prefix recording as recorded", () => {
    const pool = question({ candidates: question().candidates.map((entry) => (entry.messageId === 80 ? { ...entry, bands: [0.82, 0.55] } : entry)) });
    expect(armA(pool).order.slice(0, 4)).toEqual([10, 20, 80, 30]);
  });

  it("arm c: Jaccard on text plus recency with the live scorer's weights", () => {
    const pool = question({ candidates: question().candidates.map((entry) => (entry.messageId === 20 ? { ...entry, text: "tobin promise axle" } : entry)) });
    expect(armC(pool).order[0]).toBe(20);
    expect(armC(pool).order[1]).toBe(80);
  });

  it("arm d: four calls always counted, an invalid pick picks nothing, ranks after the picks follow ST order", () => {
    const ranked = armD(question(), [
      { pick: 60, latencyMs: 300, inputTokens: 900 },
      { pick: 999, latencyMs: 250, inputTokens: 800 },
      { pick: null, latencyMs: 200, inputTokens: 700 },
      { pick: 30, latencyMs: 250, inputTokens: 600 },
    ]);
    if ("refused" in ranked) throw new Error(ranked.refused);
    expect(ranked.order).toEqual([60, 30, 10, 20, 40, 50, 70, 80]);
    expect({ calls: ranked.calls, latencyMs: ranked.latencyMs, inputTokens: ranked.inputTokens }).toEqual({ calls: 4, latencyMs: 1000, inputTokens: 3000 });
  });

  it("arm d refuses a recording with fewer than four calls, and is owed without one", () => {
    expect(armD(question(), [{ pick: 30, latencyMs: 1, inputTokens: 1 }])).toEqual({ refused: "1 of 4 calls recorded" });
    expect(runArm("d", [question()])).toMatchObject({ metrics: null, owed: expect.stringContaining("not supplied") });
  });

  it("arm d's request is one Choice over the remaining candidates, keyed by message id", () => {
    const request = e0ChoiceRequest("q", question().candidates.slice(0, 3));
    expect(request.state).toEqual({ question: "q" });
    expect(request.questions[E0_CHOICE_KEY]).toMatchObject({ type: "choice", criteria: { m10: "line 10", m20: "line 20", m30: "line 30" } });
    expect([e0ChoicePick("m30"), e0ChoicePick("30"), e0ChoicePick(null)]).toEqual([30, null, null]);
  });

  it("ordered-output contract: exactly the 8 pool ids, no repeats, nothing added", () => {
    const pool = question();
    expect(checkOrder(pool, armE(pool).order)).toBeNull();
    expect(checkOrder(pool, [10, 20, 30])).toMatch(/3 of 8/);
    expect(checkOrder(pool, [10, 10, 30, 40, 50, 60, 70, 80])).toMatch(/repeats/);
    expect(checkOrder(pool, [11, 20, 30, 40, 50, 60, 70, 80])).toMatch(/adds 11/);
    expect(checkOrder(question({ candidates: pool.candidates.slice(0, 7) }), [10])).toMatch(/pool holds 7/);
  });
});

describe("E0 scorer", () => {
  it("hit@1, hit@4, MRR@4 and pool recall; a gold outside the pool misses every arm", () => {
    const inPool = question();
    const missing = question({ id: "q2", gold: [5] });
    const late = question({ id: "q3", gold: [70] });
    const rankings = new Map([inPool, missing, late].map((entry) => [entry.id, armE(entry)]));
    const scored = scoreRankings([inPool, missing, late], rankings);
    expect(scored).toMatchObject({ questions: 3, hits1: 0, hits4: 1, inPool: 2, poolRecall: 2 / 3, hitAt4: 1 / 3, mrrAt4: (1 / 3) / 3 });
  });

  it("a planted tie at the cut counts, raw; ST order has none", () => {
    const pool = question();
    expect(scoreRankings([pool], new Map([[pool.id, armA(pool)]])).tieRate).toBe(1);
    expect(scoreRankings([pool], new Map([[pool.id, armE(pool)]])).tieRate).toBe(0);
  });

  it("latency is null for a pool without recorded query latency, never 0; recorded latencies sum per arm", () => {
    const pool = question();
    expect(scoreRankings([pool], new Map([[pool.id, armE(pool)]])).latencyP50).toBeNull();
    const timed = question({ latencyMs: { pool: 40, bands: { "0.82": 30, "0.7": 30, "0.55": 20, "0.4": 20 } } });
    expect([armE(timed).latencyMs, armA(timed).latencyMs, armB(timed).latencyMs]).toEqual([40, 90, 140]);
  });

  it("arm d's calls reach the cost record", () => {
    const pool = question();
    const calls = Array.from({ length: 4 }, () => ({ pick: 30, latencyMs: 100, inputTokens: 500 }));
    const scored = runArm("d", [pool], { q1: calls }).metrics;
    expect(scored).toMatchObject({ hitAt1: 1, callsPerQuestion: 4, latencyP50: 400, inputTokensPerQuestion: 2000 });
  });
});

describe("E0 verdict (floors declared before any run)", () => {
  it("the cheapest arm at hit@4 0.80 wins", () => {
    const verdict = decideE0([result("e", metrics(0.8, 0.5)), result("c", metrics(0.85, 0.55)), result("a", metrics(0.8, 0.5)), result("b", metrics(0.8, 0.5)), result("d", metrics(0.9, 0.59))]);
    expect(verdict).toMatchObject({ status: "winner", winner: "e", cheapestPassing: "e" });
  });

  it("a costlier arm wins only by MRR@4 + 0.10, the highest such, ties to the cheaper", () => {
    const verdict = decideE0([result("e", metrics(0.8, 0.5)), result("c", metrics(0.85, 0.6)), result("a", metrics(0.8, 0.5)), result("b", metrics(0.9, 0.6)), result("d", metrics(0.9, 0.6))]);
    expect(verdict).toMatchObject({ status: "winner", winner: "c", cheapestPassing: "e" });
  });

  it("no arm at 0.80: no winner, a diagnostic arm, the problem named, the witness step blocked", () => {
    const ranking = decideE0([result("e", metrics(0.6, 0.4)), result("c", metrics(0.7, 0.4)), result("a", metrics(0.6, 0.4)), result("b", metrics(0.6, 0.4)), result("d", metrics(0.7, 0.5))]);
    expect(ranking).toMatchObject({ status: "no-winner", winner: null, diagnostic: "c", problem: "ranking", witnessStep: "BLOCKED (insufficient E0)" });
    const retrieval = decideE0(["e", "c", "a", "b", "d"].map((arm) => result(arm as E0ArmResult["arm"], metrics(0.5, 0.3, 0.7))));
    expect(retrieval).toMatchObject({ problem: "retrieval", diagnostic: "e" });
  });

  it("an owed arm makes the verdict incomplete; under 40 questions is insufficient", () => {
    expect(decideE0([result("e", metrics(0.9, 0.6)), result("d", null, "owed")])).toMatchObject({ status: "incomplete", winner: "e", owed: ["c", "a", "b", "d"] });
    expect(decideE0([result("e", { ...metrics(0.9, 0.6), questions: 39 })])).toMatchObject({ status: "insufficient", winner: null });
  });
});

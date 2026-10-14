import {
  armA, armB, armC, armD, armE, checkOrder, E0_ARMS, E0_COST_ORDER, E0_CUTOFF, E0_FLOORS, E0_MIN_QUESTIONS,
  type E0ArmId, type E0PoolQuestion, type E0Ranked, type E0Recorded,
} from "./e0Ranking";

export interface E0ArmMetrics {
  questions: number;
  hits1: number;
  hits4: number;
  inPool: number;
  ties: number;
  hitAt1: number;
  hitAt4: number;
  mrrAt4: number;
  poolRecall: number;
  tieRate: number;
  callsPerQuestion: number;
  latencyP50: number | null;
  latencyP95: number | null;
  inputTokensPerQuestion: number;
}

export interface E0ArmResult {
  arm: E0ArmId;
  label: string;
  metrics: E0ArmMetrics | null;
  owed: string | null;
  refused: Array<{ id: string; reason: string }>;
}

export interface E0Verdict {
  status: "insufficient" | "winner" | "no-winner" | "incomplete";
  questions: number;
  winner: E0ArmId | null;
  cheapestPassing: E0ArmId | null;
  diagnostic: E0ArmId | null;
  problem: "ranking" | "retrieval" | null;
  witnessStep: string;
  owed: E0ArmId[];
}

const reciprocalRank = (order: readonly number[], gold: readonly number[]): number => {
  const rank = order.slice(0, E0_CUTOFF).findIndex((id) => gold.includes(id));
  return rank < 0 ? 0 : 1 / (rank + 1);
};

const tiedAtCut = (scores: readonly number[]): boolean => {
  const top = scores.slice(0, E0_CUTOFF + 1);
  return top.some((score, index) => top.indexOf(score) !== index);
};

const quantile = (values: number[], q: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
};

export function scoreRankings(questions: readonly E0PoolQuestion[], rankings: ReadonlyMap<string, E0Ranked>): E0ArmMetrics {
  let hits1 = 0;
  let hits4 = 0;
  let inPool = 0;
  let ties = 0;
  let rr = 0;
  let calls = 0;
  let tokens = 0;
  const latencies: number[] = [];
  let latencyKnown = true;
  for (const question of questions) {
    const ranked = rankings.get(question.id);
    if (question.candidates.some((candidate) => question.gold.includes(candidate.messageId))) inPool += 1;
    if (!ranked) continue;
    if (question.gold.includes(ranked.order[0])) hits1 += 1;
    if (ranked.order.slice(0, E0_CUTOFF).some((id) => question.gold.includes(id))) hits4 += 1;
    rr += reciprocalRank(ranked.order, question.gold);
    if (tiedAtCut(ranked.scores)) ties += 1;
    calls += ranked.calls;
    tokens += ranked.inputTokens;
    if (ranked.latencyMs === null) latencyKnown = false;
    else latencies.push(ranked.latencyMs);
  }
  const count = questions.length;
  const share = (value: number) => (count ? value / count : 0);
  return {
    questions: count, hits1, hits4, inPool, ties,
    hitAt1: share(hits1), hitAt4: share(hits4), mrrAt4: share(rr), poolRecall: share(inPool), tieRate: share(ties),
    callsPerQuestion: share(calls),
    latencyP50: latencyKnown ? quantile(latencies, 0.5) : null,
    latencyP95: latencyKnown ? quantile(latencies, 0.95) : null,
    inputTokensPerQuestion: share(tokens),
  };
}

const RANKERS: Record<Exclude<E0ArmId, "d">, (question: E0PoolQuestion) => E0Ranked> = { a: armA, b: armB, c: armC, e: armE };

export function runArm(arm: E0ArmId, questions: readonly E0PoolQuestion[], recorded?: E0Recorded): E0ArmResult {
  const rankings = new Map<string, E0Ranked>();
  const refused: Array<{ id: string; reason: string }> = [];
  for (const question of questions) {
    const ranked = arm === "d" ? armD(question, recorded?.[question.id]) : RANKERS[arm](question);
    if ("refused" in ranked) {
      refused.push({ id: question.id, reason: ranked.refused });
      continue;
    }
    const broken = checkOrder(question, ranked.order);
    if (broken) refused.push({ id: question.id, reason: `ordered-output contract: ${broken}` });
    else rankings.set(question.id, ranked);
  }
  const owed = arm === "d" && !recorded ? "recorded Choice calls (TypeSafe, 4 per question) not supplied" : null;
  if (owed) return { arm, label: E0_ARMS[arm].label, metrics: null, owed, refused: [] };
  return { arm, label: E0_ARMS[arm].label, metrics: scoreRankings(questions, rankings), owed: refused.length ? `${refused.length} question(s) refused` : null, refused };
}

const passes = (metrics: E0ArmMetrics) => metrics.hitAt4 >= E0_FLOORS.hitAt4 - E0_FLOORS.slack;

export function decideE0(results: readonly E0ArmResult[]): E0Verdict {
  const scored = E0_COST_ORDER.map((arm) => results.find((result) => result.arm === arm)).filter((result): result is E0ArmResult => Boolean(result?.metrics));
  const owed = E0_COST_ORDER.filter((arm) => !scored.some((result) => result.arm === arm && !result.owed));
  const questions = scored[0]?.metrics?.questions ?? 0;
  const base = { questions, winner: null, cheapestPassing: null, diagnostic: null, problem: null, owed };
  if (questions < E0_MIN_QUESTIONS) return { ...base, status: "insufficient", witnessStep: "BLOCKED (insufficient E0)" };
  const metric = (result: E0ArmResult) => result.metrics as E0ArmMetrics;
  const passing = scored.filter((result) => passes(metric(result)));
  const problem = metric(scored[0]).poolRecall >= E0_FLOORS.poolRecall - E0_FLOORS.slack ? "ranking" : "retrieval";
  if (!passing.length) {
    const diagnostic = scored.reduce((best, result) => (metric(result).hitAt4 > metric(best).hitAt4 ? result : best)).arm;
    const status = owed.length ? "incomplete" : "no-winner";
    return { ...base, status, diagnostic, problem, witnessStep: "BLOCKED (insufficient E0)" };
  }
  const [cheapest, ...costlier] = passing;
  const bar = metric(cheapest).mrrAt4 + E0_FLOORS.mrrMargin - E0_FLOORS.slack;
  const challenger = costlier.filter((result) => metric(result).mrrAt4 >= bar)
    .reduce<E0ArmResult | null>((best, result) => (!best || metric(result).mrrAt4 > metric(best).mrrAt4 ? result : best), null);
  const winner = (challenger ?? cheapest).arm;
  if (owed.length) return { ...base, status: "incomplete", winner, cheapestPassing: cheapest.arm, witnessStep: "pending (incomplete E0)" };
  return { ...base, status: "winner", winner, cheapestPassing: cheapest.arm, witnessStep: "may run after v2.8 01 M1" };
}

import { E0_ARMS, E0_COST_ORDER, localScore, rankByScore, type E0Candidate, type E0PoolQuestion, type E0Ranked, type E0Recorded } from "./e0Ranking";
import { decideE0, runArm, scoreRankings, type E0ArmResult, type E0Verdict } from "./e0Score";

export const E0_GOLDEN_FORMAT = "so-e0-golden/1";
export const E0_OUTSIDE_POOL = -1;

export interface E0GoldenSlot {
  slot: number;
  bands: number[];
  local: number;
}

export interface E0GoldenQuestion {
  q: string;
  gold: number[];
  slots: E0GoldenSlot[];
  latencyMs: E0PoolQuestion["latencyMs"] | null;
  calls: Array<{ pick: number | null; latencyMs: number; inputTokens: number }> | null;
}

export interface E0Golden {
  format: typeof E0_GOLDEN_FORMAT;
  provider: string;
  freeze: { labels: string; pool: string };
  questions: E0GoldenQuestion[];
}

export function e0GoldenFrom(questions: readonly E0PoolQuestion[], recorded: E0Recorded | undefined, provider: string, freeze: E0Golden["freeze"]): E0Golden {
  return {
    format: E0_GOLDEN_FORMAT,
    provider,
    freeze,
    questions: questions.map((question, index) => {
      const slotOf = new Map(question.candidates.map((candidate) => [candidate.messageId, candidate.stRank]));
      const gold = question.gold.filter((id) => slotOf.has(id)).map((id) => slotOf.get(id) as number);
      const slotPick = (pick: number | null) => (pick === null ? null : slotOf.get(pick) ?? E0_OUTSIDE_POOL);
      const calls = recorded?.[question.id]?.map((call) => ({ pick: slotPick(call.pick), latencyMs: call.latencyMs, inputTokens: call.inputTokens })) ?? null;
      return {
        q: `q${String(index + 1).padStart(2, "0")}`,
        gold: gold.length ? gold.sort((left, right) => left - right) : [E0_OUTSIDE_POOL],
        slots: [...question.candidates].sort((left, right) => left.stRank - right.stRank)
          .map((candidate) => ({ slot: candidate.stRank, bands: candidate.bands, local: localScore(question, candidate) })),
        latencyMs: question.latencyMs ?? null,
        calls,
      };
    }),
  };
}

const asPool = (question: E0GoldenQuestion): E0PoolQuestion => ({
  id: question.q,
  askMessageId: 0,
  query: "",
  gold: question.gold,
  candidates: question.slots.map((slot): E0Candidate => ({ messageId: slot.slot, textHash: "", text: "", stRank: slot.slot, bands: slot.bands })),
  ...(question.latencyMs ? { latencyMs: question.latencyMs } : {}),
});

const localArm = (golden: E0Golden, questions: E0PoolQuestion[]): E0ArmResult => {
  const rankings = new Map<string, E0Ranked>();
  golden.questions.forEach((question, index) => {
    const local = new Map(question.slots.map((slot) => [slot.slot, slot.local]));
    const ranked = rankByScore(questions[index].candidates, (candidate) => local.get(candidate.messageId) ?? 0);
    rankings.set(question.q, { ...ranked, calls: 0, latencyMs: question.latencyMs?.pool ?? null, inputTokens: 0 });
  });
  return { arm: "c", label: E0_ARMS.c.label, metrics: scoreRankings(questions, rankings), owed: null, refused: [] };
};

export function replayE0Golden(golden: E0Golden): { arms: E0ArmResult[]; verdict: E0Verdict } {
  if (golden.format !== E0_GOLDEN_FORMAT) throw new Error(`golden: format must be ${E0_GOLDEN_FORMAT}`);
  const questions = golden.questions.map(asPool);
  const recorded: E0Recorded | undefined = golden.questions.every((question) => question.calls)
    ? Object.fromEntries(golden.questions.map((question) => [question.q, question.calls ?? []]))
    : undefined;
  const arms = E0_COST_ORDER.map((arm) => (arm === "c" ? localArm(golden, questions) : runArm(arm, questions, arm === "d" ? recorded : undefined)));
  return { arms, verdict: decideE0(arms) };
}

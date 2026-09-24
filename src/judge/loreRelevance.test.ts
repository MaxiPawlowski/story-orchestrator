import { readFileSync } from "node:fs";
import { join } from "node:path";
import { requestKey, resolveRelevanceCases, runLoreRelevanceCalibration, type LoreRelevanceFixture } from "./loreRelevanceCalibration";
import type { JudgeAnswer, JudgeRequest } from "./types";

// v2.3 plan 10 (A): the recorded comparison, replayed. Both arms answer from the SAME golden, keyed by
// the request they were asked, so the two metric sets are computed over identical evidence and the
// harness itself is what is being re-tested here — the live numbers were measured once and are read
// from the golden's own summary rather than being re-derived by a judge call in CI.
interface Golden {
  model: string;
  summary: { arms: Array<{ arm: string; precisionAt4: number; ndcgAt4: number; tieRate: number; boundaryTieRate: number; ok: boolean }>; disagreements: number };
  calls: Array<{ arm: string; key: number; questionCount: number; answers: Record<string, JudgeAnswer> }>;
}

const golden = (): Golden => JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge/lore-relevance.json"), "utf8")) as Golden;

const fixture = (): LoreRelevanceFixture => {
  const own = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge/lore-relevance.json"), "utf8")) as LoreRelevanceFixture & { poolsFrom?: string };
  const source = own.poolsFrom ? (JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", own.poolsFrom), "utf8")) as { pools: LoreRelevanceFixture["pools"] }) : null;
  return { pools: { ...(own.pools ?? {}), ...(source?.pools ?? {}) }, rows: own.rows };
};

describe("lore relevance comparison (v2.3 plan 10 A)", () => {
  const replay = () => {
    const record = golden();
    const byRequest = new Map(record.calls.map((call) => [call.key, call]));
    return async (request: JudgeRequest) => {
      const call = byRequest.get(requestKey(request.state, request.questions));
      // The hidden guard: a replay that asked a different question would silently measure its own
      // fixture, so an unknown key is a failure rather than an empty answer.
      if (!call || call.questionCount !== Object.keys(request.questions).length) throw new Error("golden has no answer for this request");
      return { answers: call.answers, model: record.model, latencyMs: 0, stateChars: 0, questionCount: call.questionCount, cached: false };
    };
  };

  it("replays both arms from the recorded answers and reproduces the measured metrics", async () => {
    const record = golden();
    const report = await runLoreRelevanceCalibration(replay(), resolveRelevanceCases(fixture()));
    const measured = Object.fromEntries(record.summary.arms.map((arm) => [arm.arm, arm]));
    expect(report.noul.precisionAt4).toBe(measured.noul.precisionAt4);
    expect(report.score.precisionAt4).toBe(measured.score.precisionAt4);
    expect(report.noul.ndcgAt4).toBe(measured.noul.ndcgAt4);
    expect(report.score.ndcgAt4).toBe(measured.score.ndcgAt4);
    expect(report.noul.tieRate).toBe(measured.noul.tieRate);
    expect(report.score.tieRate).toBe(measured.score.tieRate);
    expect(report.disagreements).toBe(record.summary.disagreements);
  });

  it("records a comparison in which the Noul arm orders better and ties less than the rounded Score arm", async () => {
    const record = golden();
    const measured = Object.fromEntries(record.summary.arms.map((arm) => [arm.arm, arm]));
    expect(measured.noul.ndcgAt4).toBeGreaterThan(measured.score.ndcgAt4);
    expect(measured.noul.tieRate).toBeLessThan(measured.score.tieRate);
    // The finding the plan turns on: neither arm cleared its floor, so the Score arm is NOT built.
    expect(measured.noul.ok).toBe(false);
    expect(measured.score.ok).toBe(false);
  });

  it("covers every row of the fixture, Spanish included", async () => {
    const rows = resolveRelevanceCases(fixture()).filter((row) => row.candidates?.length);
    const spanish = rows.filter((row) => row.lang === "es");
    expect(rows).toHaveLength(25);
    expect(spanish.length).toBeGreaterThanOrEqual(8);
  });
});

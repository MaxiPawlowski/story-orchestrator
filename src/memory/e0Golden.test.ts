import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { e0GoldenFrom, replayE0Golden, E0_OUTSIDE_POOL, type E0Golden } from "./e0Golden";
import type { E0PoolQuestion, E0Recorded } from "./e0Ranking";
import { decideE0, runArm } from "./e0Score";
import { E0_COST_ORDER, E0_FLOORS } from "./e0Ranking";

const root = join(__dirname, "../../test");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

const syntheticPool = (): E0PoolQuestion[] => read("measurements/v2.8/21-e0/synthetic.pool.json").questions;

const scriptedCalls = (questions: E0PoolQuestion[]): E0Recorded => Object.fromEntries(questions.map((question, index) => {
  const ids = question.candidates.map((candidate) => candidate.messageId);
  const picks = index % 3 === 0 ? [ids[3], 9999, ids[0], null] : [ids[7], ids[6], ids[5], ids[4]];
  return [question.id, picks.map((pick, call) => ({ pick, latencyMs: 200 + call, inputTokens: 500 - call }))];
}));

describe("E0 public golden (no text, slots for ids)", () => {
  it("replays a run built from a pool to the same arm metrics and verdict as the pool itself", () => {
    const questions = syntheticPool();
    const recorded = scriptedCalls(questions);
    const direct = E0_COST_ORDER.map((arm) => runArm(arm, questions, arm === "d" ? recorded : undefined));
    const golden = e0GoldenFrom(questions, recorded, "stub", { labels: "l", pool: "p" });
    expect(JSON.stringify(golden)).not.toMatch(/"text"|"query"|"messageId"/);
    const replayed = replayE0Golden(JSON.parse(JSON.stringify(golden)));
    expect(replayed.arms.map((arm) => [arm.arm, arm.metrics])).toEqual(direct.map((arm) => [arm.arm, arm.metrics]));
    expect(replayed.verdict).toEqual(decideE0(direct));
  });

  it("keeps an out-of-pool gold a pool miss and an out-of-pool pick a call that picks nothing", () => {
    const [first] = syntheticPool();
    const lost = { ...first, gold: [123456] };
    const golden = e0GoldenFrom([lost], { [first.id]: [{ pick: 123456, latencyMs: 1, inputTokens: 1 }, { pick: null, latencyMs: 1, inputTokens: 1 }, { pick: null, latencyMs: 1, inputTokens: 1 }, { pick: null, latencyMs: 1, inputTokens: 1 }] }, "stub", { labels: "l", pool: "p" });
    expect(golden.questions[0].gold).toEqual([E0_OUTSIDE_POOL]);
    expect(golden.questions[0].calls?.[0].pick).toBe(E0_OUTSIDE_POOL);
    const replayed = replayE0Golden(golden);
    expect(replayed.arms.find((arm) => arm.arm === "d")?.metrics).toMatchObject({ inPool: 0, hits4: 0, callsPerQuestion: 4 });
  });

  const privateGolden = "goldens/e0/private-result.json";
  (existsSync(join(root, privateGolden)) ? it : it.skip)("private run 2026-10-16: the recorded golden replays to its recorded verdict and metrics", () => {
    const golden = read(privateGolden) as E0Golden & { result: { arms: Array<{ arm: string; metrics: unknown }>; verdict: unknown } };
    const replayed = replayE0Golden(golden);
    expect(replayed.arms.map((arm) => [arm.arm, arm.metrics])).toEqual(golden.result.arms.map((arm) => [arm.arm, arm.metrics]));
    expect(replayed.verdict).toEqual(golden.result.verdict);
    expect(golden.questions.length).toBeGreaterThanOrEqual(40);
    const flipped = { ...golden, questions: golden.questions.map((question) => ({ ...question, gold: [E0_OUTSIDE_POOL] })) };
    expect(replayE0Golden(flipped).arms.every((arm) => !arm.metrics || arm.metrics.hitAt4 < E0_FLOORS.hitAt4)).toBe(true);
  });
});

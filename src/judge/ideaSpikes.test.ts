import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SPIKE_IDEAS, SPIKE_FIXTURE, scoreSpike, spikeCalls, draftModeFloors, type SpikeAnswers, type SpikeFixture } from "./ideaSpikes";
import { hotPhrases } from "./repetition";

const root = join(__dirname, "../../test");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

describe("plan 13 recorded Phase A answers", () => {
  for (const idea of SPIKE_IDEAS) {
    for (const run of [1, 2]) {
      const name = SPIKE_FIXTURE[idea];
      const path = `goldens/judge/${name}.run${run}.json`;
      if (!existsSync(join(root, path))) throw new Error(`Missing Phase A run: ${path}`);
      test(`${idea} run ${run}: exact request and fixture replay preserves the recorded verdict`, () => {
        const fixture: SpikeFixture = read(`fixtures/judge/${name}.json`);
        const golden = read(path);
        const revision = createHash("sha256").update(JSON.stringify(fixture)).digest("hex").slice(0, 12);
        expect(golden.fixtureRevision).toBe(revision);
        const calls = spikeCalls(idea, fixture);
        expect(golden.calls).toHaveLength(calls.length);
        const answers: SpikeAnswers = new Map();
        for (const call of calls) {
          const recorded = golden.calls.find((entry: { id: string }) => entry.id === call.id);
          expect(recorded).toBeDefined();
          expect([recorded.state, recorded.questions]).toEqual([call.request.state, call.request.questions]);
          answers.set(call.id, { answers: recorded.answers, latencyMs: recorded.latencyMs });
        }
        const result = scoreSpike(idea, fixture, answers);
        expect(result.passed).toBe(golden.verdict.passed);
        for (const [key, value] of Object.entries(result.metrics)) {
          if (idea === "sceneConfirm" && key.startsWith("whole")) continue;
          expect(value).toBe(golden.verdict.metrics[key]);
        }
        if (idea === "canonVerify") expect(draftModeFloors(result).every((entry) => entry.ok)).toBe(true);
        expect(scoreSpike(idea, fixture, new Map()).passed).toBe(false);
      });
    }
  }
});

describe("N6 pure phrase miner", () => {
  const fixture = read("fixtures/judge/spike-repetition.json") as { rows: Array<{ id: string; replies: string[]; label: string; hot: string[] }> };
  for (const run of [1, 2]) test(`N6 run ${run}: loop recall and fresh specificity meet frozen floors`, () => {
    const loops = fixture.rows.filter((row) => row.label === "loops");
    const fresh = fixture.rows.filter((row) => row.label === "fresh");
    const hits = loops.filter((row) => hotPhrases(row.replies).some((phrase) => row.hot.some((expected) => expected.includes(phrase) || phrase.includes(expected))));
    expect(hits.length / loops.length).toBeGreaterThanOrEqual(0.8);
    expect(fresh.filter((row) => !hotPhrases(row.replies).length).length / fresh.length).toBeGreaterThanOrEqual(0.95);
  });
  test("multiple mentions in one reply are not four distinct replies", () => {
    expect(hotPhrases(["the air held its breath. the air held its breath. the air held its breath. the air held its breath."])).toEqual([]);
  });
});

import { judgeReadiness, judgeReadinessConcerns, JUDGE_READINESS } from "./readiness";
import { defaultJudgeSettings, JUDGE_USE_DEPENDENCIES, JUDGE_USE_KEYS, type JudgeSettings } from "./settings";

const settings = (uses: Partial<Record<string, boolean>> = {}, patch: Partial<JudgeSettings> = {}): JudgeSettings => ({
  ...defaultJudgeSettings(),
  enabled: true,
  uses: { ...defaultJudgeSettings().uses, ...uses } as JudgeSettings["uses"],
  ...patch,
});

describe("judge readiness (v2.3 plan 09)", () => {
  it("has a fact for every use the settings declare, and no orphan rows", () => {
    // The table is the acceptance report's; a new usage without a row would render an empty line.
    expect(Object.keys(JUDGE_READINESS).sort()).toEqual([...JUDGE_USE_KEYS].sort());
    JUDGE_USE_KEYS.forEach((key) => {
      const fact = JUDGE_READINESS[key];
      expect(typeof fact.recommendation).toBe("string");
      expect(fact.recommendation.length).toBeGreaterThan(10);
    });
  });

  it("never reports a rate without the latency it was measured with, or the reverse", () => {
    // Both come from the same calibration run (plan 11 re-measured every use on 2026-09-22), so a
    // rate with no latency is a row whose evidence was lost rather than a row that has none.
    JUDGE_USE_KEYS.forEach((key) => {
      const fact = JUDGE_READINESS[key];
      expect(fact.calibration === null).toBe(fact.latencyP50Ms === null);
      if (fact.latencyP50Ms !== null) expect(fact.latencyP50Ms).toBeGreaterThan(0);
    });
  });

  it("reports everything off by default, so the summary is empty on an untouched install", () => {
    const rows = judgeReadiness(defaultJudgeSettings());
    expect(rows).toHaveLength(JUDGE_USE_KEYS.length);
    expect(rows.every((row) => row.verdict === "off")).toBe(true);
    expect(judgeReadinessConcerns(rows)).toEqual([]);
  });

  it("distinguishes measured from unproven, which is the whole point of the summary", () => {
    const rows = judgeReadiness(settings({ stallCheck: true, sceneOoc: true }));
    expect(rows.find((row) => row.key === "stallCheck")).toMatchObject({ enabled: true, verdict: "measured", calibration: 1, live: "J11.23" });
    expect(rows.find((row) => row.key === "sceneOoc")).toMatchObject({ enabled: true, verdict: "unproven", calibration: null });
    expect(judgeReadinessConcerns(rows).map((row) => row.key)).toEqual(["sceneOoc"]);
  });

  it("calls an enabled use with its dependency off blocked, not measured", () => {
    const rows = judgeReadiness(settings({ expansionLookahead: true }), JUDGE_USE_DEPENDENCIES);
    expect(rows.find((row) => row.key === "expansionLookahead")).toMatchObject({ enabled: true, verdict: "blocked", blockedBy: "lookahead" });
    expect(judgeReadinessConcerns(rows).map((row) => row.key)).toEqual(["expansionLookahead"]);

    const both = judgeReadiness(settings({ expansionLookahead: true, lookahead: true }), JUDGE_USE_DEPENDENCIES);
    expect(both.find((row) => row.key === "expansionLookahead")?.verdict).toBe("measured");
    expect(judgeReadinessConcerns(both)).toEqual([]);
  });

  it("does not claim a use is working when the judge itself is off", () => {
    // A use flag left on with the master switch off is a real state (the panel keeps the flags), and
    // the summary says off rather than measured for the whole list.
    const rows = judgeReadiness(settings({ stallCheck: true }, { enabled: false }));
    expect(rows.every((row) => row.verdict === "off")).toBe(true);
  });
});

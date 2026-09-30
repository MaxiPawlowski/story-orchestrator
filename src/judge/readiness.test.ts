import { judgeReadiness, judgeReadinessConcerns, JUDGE_READINESS } from "./readiness";
import { AUTHOR_JUDGE_USES, BUILT_JUDGE_USES, defaultJudgeSettings, JUDGE_USE_COPY, JUDGE_USE_DEPENDENCIES, JUDGE_USE_KEYS, type JudgeSettings } from "./settings";

const settings = (uses: Partial<Record<string, boolean>> = {}, patch: Partial<JudgeSettings> = {}): JudgeSettings => ({
  ...defaultJudgeSettings(),
  enabled: true,
  uses: { ...defaultJudgeSettings().uses, ...uses } as JudgeSettings["uses"],
  ...patch,
});

describe("judge readiness (v2.3 plan 09)", () => {
  it("has a fact for every use the settings declare, and no orphan rows", () => {
    // The table is the acceptance report's; a new usage without a row would render an empty line.
    expect(Object.keys(JUDGE_READINESS).sort()).toEqual([...JUDGE_USE_KEYS, "warden"].sort());
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

  it("reports shipped uses enabled by default", () => {
    const rows = judgeReadiness(defaultJudgeSettings());
    expect(rows).toHaveLength(JUDGE_USE_KEYS.length);
    expect(rows.every((row) => row.enabled)).toBe(true);
  });

  // v2.4 plan 07 (X22): sceneOoc and memoryRerank are removed, so every declared use is built,
  // listed in the panel, and carries its evidence.
  it("lists every use in the panel order and none is missing its evidence", () => {
    const rows = judgeReadiness(settings({ stallCheck: true }));
    expect(rows.find((row) => row.key === "stallCheck")).toMatchObject({ enabled: true, verdict: "measured", calibration: 1, live: "J11.23" });
    expect([...BUILT_JUDGE_USES].sort()).toEqual([...JUDGE_USE_KEYS].sort());
    expect(JUDGE_USE_KEYS.filter((key) => JUDGE_READINESS[key].calibration === null || JUDGE_READINESS[key].measuredOn === null)).toEqual(["loreExclusive", "expressions"]);
    expect(JUDGE_USE_KEYS.every((key) => !JUDGE_USE_COPY[key].description.startsWith("Not built") && !JUDGE_USE_COPY[key].description.startsWith("Not measured"))).toBe(true);
  });

  // v2.4 plan 07 Phase A, 2026-09-25: both warden families cleared their predeclared floors on jev-1.13.0
  // (test/goldens/judge/agency.calibration.json, house-rules.calibration.json); measured, still author-only and off.
  it("reports the agency and house-rule families measured on the model Phase A ran on", () => {
    expect(JUDGE_READINESS.agencyCheck).toMatchObject({ calibration: 1, latencyP50Ms: 1441, measuredOn: "jev-1.13.0" });
    expect(JUDGE_READINESS.houseRules).toMatchObject({ calibration: 0.9896, latencyP50Ms: 499, measuredOn: "jev-1.13.0" });
    expect((["agencyCheck", "houseRules"] as const).every((key) => AUTHOR_JUDGE_USES.includes(key) && defaultJudgeSettings().uses[key] === true)).toBe(true);
    expect(judgeReadiness(settings({ agencyCheck: true, houseRules: true })).filter((row) => ["agencyCheck", "houseRules"].includes(row.key)).map((row) => row.verdict)).toEqual(["measured", "measured"]);
    expect(judgeReadiness(settings({ agencyCheck: true }, { model: "jev-2.0.0" })).find((row) => row.key === "agencyCheck")?.verdict).toBe("unproven");
  });

  it("L5: exclusive lore selection is author-only, off, blocked without lore selection and unproven with it until X1/X2 run", () => {
    expect(AUTHOR_JUDGE_USES.includes("loreExclusive") && defaultJudgeSettings().uses.loreExclusive === true).toBe(true);
    expect(judgeReadiness(settings({ loreExclusive: true, loreSelect: false }), JUDGE_USE_DEPENDENCIES).find((row) => row.key === "loreExclusive")).toMatchObject({ verdict: "blocked", blockedBy: "loreSelect" });
    expect(judgeReadiness(settings({ loreExclusive: true, loreSelect: true }), JUDGE_USE_DEPENDENCIES).find((row) => row.key === "loreExclusive")?.verdict).toBe("unproven");
  });

  it("calls an enabled use with its dependency off blocked, not measured", () => {
    const rows = judgeReadiness(settings({ expansionLookahead: true, lookahead: false }), JUDGE_USE_DEPENDENCIES);
    expect(rows.find((row) => row.key === "expansionLookahead")).toMatchObject({ enabled: true, verdict: "blocked", blockedBy: "lookahead" });
    expect(judgeReadinessConcerns(rows).map((row) => row.key)).toContain("expansionLookahead");

    const both = judgeReadiness(settings({ expansionLookahead: true, lookahead: true }), JUDGE_USE_DEPENDENCIES);
    expect(both.find((row) => row.key === "expansionLookahead")?.verdict).toBe("measured");
    expect(judgeReadinessConcerns(both).map((row) => row.key)).toEqual(["loreExclusive", "expressions"]);
  });

  it("does not claim a use is working when the judge itself is off", () => {
    // A use flag left on with the master switch off is a real state (the panel keeps the flags), and
    // the summary says off rather than measured for the whole list.
    const rows = judgeReadiness(settings({ stallCheck: true }, { enabled: false }));
    expect(rows.every((row) => row.verdict === "off")).toBe(true);
  });
});

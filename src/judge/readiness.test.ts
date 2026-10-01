import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureStale, judgeReadiness, judgeReadinessConcerns, JUDGE_FIXTURE_REVISION, JUDGE_READINESS, JUDGE_READINESS_BY_PROVIDER, type JudgeReadinessKey } from "./readiness";
import { AUTHOR_JUDGE_USES, BUILT_JUDGE_USES, defaultJudgeSettings, JUDGE_USE_COPY, JUDGE_USE_DEPENDENCIES, JUDGE_USE_KEYS, type JudgeSettings } from "./settings";

const REMEASURED = { fixtureRevisions: Object.fromEntries(Object.entries(JUDGE_READINESS_BY_PROVIDER.typesafe).flatMap(([key, fact]) => (fact?.fixtureRevision ? [[key, fact.fixtureRevision]] : []))) };
const remeasured: typeof judgeReadiness = (settings, dependencies = {}, answered = null, extra = {}) => judgeReadiness(settings, dependencies, answered, { ...extra, ...REMEASURED });

const FIXTURE_OF: Partial<Record<JudgeReadinessKey, string>> = {
  stallCheck: "stall",
  memoryVerify: "memory-verify",
  warden: "continuity",
  expansionCritic: "critic",
  expansionLookahead: "variants",
  lookahead: "variants",
  curatorFilter: "curator-filter",
  typedExtraction: "typed",
  memoryPairs: "memory-pairs",
  sceneTrigger: "scene",
  sceneTracker: "scene",
  director: "director",
  agencyCheck: "agency",
  houseRules: "house-rules",
  loreSelect: "lore",
  wardenLore: "warden-lore",
};
const revisionOf = (fixture: string) => createHash("sha256").update(JSON.stringify(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", `${fixture}.json`), "utf8")))).digest("hex").slice(0, 12);

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
    const rows = remeasured(settings({ stallCheck: true }));
    expect(rows.find((row) => row.key === "stallCheck")).toMatchObject({ enabled: true, verdict: "measured", calibration: 1, live: "J11.23" });
    expect([...BUILT_JUDGE_USES].sort()).toEqual([...JUDGE_USE_KEYS].sort());
    expect(JUDGE_USE_KEYS.filter((key) => JUDGE_READINESS[key].calibration === null || JUDGE_READINESS[key].measuredOn === null)).toEqual(["loreExclusive", "expressions"]);
    expect(JUDGE_USE_KEYS.every((key) => !JUDGE_USE_COPY[key].description.startsWith("Not built") && !JUDGE_USE_COPY[key].description.startsWith("Not measured"))).toBe(true);
  });

  // v2.4 plan 07 Phase A, 2026-09-25: both warden families cleared their predeclared floors on jev-1.13.0
  // (test/goldens/judge/agency.calibration.json, house-rules.calibration.json); measured, still author-only and off.
  it("reports the agency and house-rule families measured on the model Phase A ran on", () => {
    expect(JUDGE_READINESS.agencyCheck).toMatchObject({ calibration: 1, latencyP50Ms: 241, measuredOn: "jev-1.13.0" });
    expect(JUDGE_READINESS.houseRules).toMatchObject({ calibration: 0.9875, latencyP50Ms: 235, measuredOn: "jev-1.13.0" });
    expect((["agencyCheck", "houseRules"] as const).every((key) => AUTHOR_JUDGE_USES.includes(key) && defaultJudgeSettings().uses[key] === true)).toBe(true);
    expect(remeasured(settings({ agencyCheck: true, houseRules: true })).filter((row) => ["agencyCheck", "houseRules"].includes(row.key)).map((row) => row.verdict)).toEqual(["measured", "measured"]);
    expect(remeasured(settings({ agencyCheck: true }, { model: "jev-2.0.0" })).find((row) => row.key === "agencyCheck")?.verdict).toBe("unproven");
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

    const both = remeasured(settings({ expansionLookahead: true, lookahead: true }), JUDGE_USE_DEPENDENCIES);
    expect(both.find((row) => row.key === "expansionLookahead")?.verdict).toBe("measured");
    expect(judgeReadinessConcerns(both).map((row) => row.key)).toEqual(["loreExclusive", "expressions"]);
  });

  it("AS-16: every measured use names the fixture revision it was measured on, and the current revision is the fixture file's", () => {
    const measured = JUDGE_USE_KEYS.filter((key) => JUDGE_READINESS[key].calibration !== null);
    expect(Object.keys(JUDGE_FIXTURE_REVISION).sort()).toEqual([...measured, "warden"].sort());
    expect(Object.keys(FIXTURE_OF).sort()).toEqual(Object.keys(JUDGE_FIXTURE_REVISION).sort());
    for (const [key, fixture] of Object.entries(FIXTURE_OF)) expect([key, JUDGE_FIXTURE_REVISION[key as JudgeReadinessKey]]).toEqual([key, revisionOf(fixture as string)]);
    for (const key of Object.keys(JUDGE_FIXTURE_REVISION) as JudgeReadinessKey[]) expect(typeof JUDGE_READINESS_BY_PROVIDER.typesafe[key]?.fixtureRevision).toBe("string");
  });

  it("AS-16: a rate measured on an older fixture revision reads needs re-measure (unproven), never measured", () => {
    const fact = { ...JUDGE_READINESS.stallCheck, fixtureRevision: "000000000000" };
    expect(fixtureStale("stallCheck", fact)).toEqual({ measured: "000000000000", current: JUDGE_FIXTURE_REVISION.stallCheck });
    expect(fixtureStale("stallCheck", { ...fact, fixtureRevision: undefined })).toEqual({ measured: null, current: JUDGE_FIXTURE_REVISION.stallCheck });
    expect(fixtureStale("stallCheck", { ...fact, fixtureRevision: JUDGE_FIXTURE_REVISION.stallCheck })).toBeUndefined();
    expect(fixtureStale("loreExclusive", JUDGE_READINESS.loreExclusive)).toBeUndefined();
    const edited = { fixtureRevisions: Object.fromEntries(Object.keys(JUDGE_FIXTURE_REVISION).map((key) => [key, "111111111111"])) };
    const rows = judgeReadiness(settings({ stallCheck: true }), {}, null, edited);
    expect(rows.find((row) => row.key === "stallCheck")).toMatchObject({ verdict: "unproven", calibration: 1, fixtureStale: { current: "111111111111" } });
    expect(rows.filter((row) => row.verdict === "measured")).toEqual([]);
    expect(judgeReadinessConcerns(rows).map((row) => row.key)).toEqual(expect.arrayContaining(["stallCheck", "memoryVerify", "sceneTracker", "director"]));
    const shipped = judgeReadiness(settings({ stallCheck: true }));
    expect(shipped.find((row) => row.key === "stallCheck")).toMatchObject({ verdict: "measured" });
    expect(shipped.filter((row) => row.fixtureStale)).toEqual([]);
  });

  it("does not claim a use is working when the judge itself is off", () => {
    // A use flag left on with the master switch off is a real state (the panel keeps the flags), and
    // the summary says off rather than measured for the whole list.
    const rows = judgeReadiness(settings({ stallCheck: true }, { enabled: false }));
    expect(rows.every((row) => row.verdict === "off")).toBe(true);
  });
});

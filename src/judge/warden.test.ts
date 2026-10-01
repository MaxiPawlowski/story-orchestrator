import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOUSE_RULES_MAX } from "@engine/index";
import { buildContinuityRequest } from "./curators";
import { AGENCY_SCORE, HOUSE_RULE_P, WARDEN_MAX_RULES } from "./policy";
import { validateJudgeRequest } from "./questions";
import { judgeFamilyScores, type JudgeSelfTestReport } from "./selfTest";
import type { JudgeAnswer, JudgeRequest, JudgeResult } from "./types";
import { agencyNoteText, buildWardenRequests, readWarden, wardenFamiliesAsked, wardenRecordP, type WardenInput } from "./warden";
import { runAgencyCalibration, runCombinedContinuityCalibration, runHouseRuleCalibration, runWardenRescore, type AgencyCase, type CombinedContinuityCase, type HouseRuleCase } from "./wardenCalibration";

const reply = { speaker: "Arin", text: "Arin shrugs." };
const noul = (p: number): JudgeAnswer => ({ type: "noul", noul: p });
const scored = (value: number): JudgeAnswer => ({ type: "score", score: value, confidence: 0.9, probabilities: {} });
const input = (over: Partial<WardenInput> = {}): WardenInput => ({ reply, facts: [], agency: null, houseRules: [], ...over });
const fixture = <T>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", name), "utf8")) as { floors: Record<string, number>; labelledAt: string; rows: T[] };
const result = (answers: Record<string, JudgeAnswer> | null): JudgeResult => ({ answers, model: "jev-1.13.0", latencyMs: 5, stateChars: 0, questionCount: 0, cached: false });

describe("warden request (v2.4 plan 07 T22/T23)", () => {
  it("asks exactly today's continuity request when only continuity is on", () => {
    const facts = ["The bridge is gone."];
    expect(buildWardenRequests(input({ facts }))).toEqual([buildContinuityRequest(reply, facts)]);
    expect(JSON.stringify(buildWardenRequests(input({ facts }))[0])).toBe(JSON.stringify(buildContinuityRequest(reply, facts)));
  });

  it("asks nothing when every family is off", () => {
    expect(buildWardenRequests(input())).toEqual([]);
    expect(wardenFamiliesAsked(input())).toEqual([]);
  });

  it("combines the families into one request: facts, then the agency score, then one noul per rule", () => {
    const [request, ...rest] = buildWardenRequests(input({ facts: ["F."], agency: { player: "Max", message: "I wait." }, houseRules: ["No guns.", "No swearing."] }));
    expect(rest).toEqual([]);
    expect(Object.keys(request.state)).toEqual(["established_facts", "reply", "player", "player_message", "house_rules"]);
    expect(Object.keys(request.questions)).toEqual(["fact:0", "agency", "rule:0", "rule:1"]);
    expect(request.questions.agency.type).toBe("score");
    expect((request.questions.agency as { criteria: string[] }).criteria).toHaveLength(5);
    expect(request.questions["rule:1"].instructions).toBe("Does `reply` break `house_rules.rule_1`?");
    expect(request.state.house_rules).toEqual({ rule_0: "No guns.", rule_1: "No swearing." });
    expect(validateJudgeRequest(request)).toEqual([]);
  });

  it("asks without facts when another family is on (no facts no longer skips the call)", () => {
    const [request] = buildWardenRequests(input({ houseRules: ["No guns."] }));
    expect(request.state).toEqual({ reply, house_rules: { rule_0: "No guns." } });
    expect(wardenFamiliesAsked(input({ facts: ["F."], houseRules: ["R."] }))).toEqual(["continuity", "house-rule"]);
  });

  it("caps the rules at eight, the schema's own cap", () => {
    expect(WARDEN_MAX_RULES).toBe(HOUSE_RULES_MAX);
    const rules = Array.from({ length: WARDEN_MAX_RULES + 3 }, (_, index) => `Rule ${index}.`);
    const [request] = buildWardenRequests(input({ houseRules: rules }));
    expect(Object.keys(request.questions)).toHaveLength(WARDEN_MAX_RULES);
  });

  it("arm B asks each family as its own call, the continuity one unchanged", () => {
    const requests = buildWardenRequests(input({ facts: ["F."], agency: { player: "Max", message: "I wait." }, houseRules: ["No guns."] }), "separate");
    expect(requests).toHaveLength(3);
    expect(requests[0]).toEqual(buildContinuityRequest(reply, ["F."]));
    expect(requests[1].state).toEqual({ reply, player: "Max", player_message: "I wait." });
    expect(Object.keys(requests[2].questions)).toEqual(["rule:0"]);
  });
});

describe("warden findings", () => {
  const all = input({ facts: ["The bridge is gone."], agency: { player: "Max", message: "I wait." }, houseRules: ["No guns.", "No swearing.", "No horses."] });

  it("flags agency on the raw score strictly above 2.5, with the persona in the clause", () => {
    expect(readWarden({ agency: scored(AGENCY_SCORE) }, all).map((finding) => finding.family)).toEqual([]);
    const [finding] = readWarden({ agency: scored(2.51) }, all);
    expect(finding).toEqual({ family: "agency", text: agencyNoteText("Max"), facts: [], score: 2.51 });
    expect(finding.text).toBe("Agency: Max's own words and decisions are theirs to write: do not narrate Max acting, accepting, agreeing or refusing.");
    expect(agencyNoteText("  ")).toBe("Agency: {{user}}'s own words and decisions are theirs to write: do not narrate {{user}} acting, accepting, agreeing or refusing.");
  });

  it("names at most two broken rules verbatim, most certain first, at HOUSE_RULE_P", () => {
    const findings = readWarden({ "rule:0": noul(0.8), "rule:1": noul(0.95), "rule:2": noul(HOUSE_RULE_P) }, all);
    expect(findings).toEqual([{ family: "house-rule", facts: [], rules: ["No swearing.", "No guns."], text: 'House rule: "No swearing." — keep the next reply within it.\nHouse rule: "No guns." — keep the next reply within it.' }]);
    expect(readWarden({ "rule:0": noul(0.69) }, all)).toEqual([]);
    expect(readWarden({ "rule:1": noul(HOUSE_RULE_P) }, all).map((finding) => finding.rules)).toEqual([["No swearing."]]);
  });

  it("orders the families continuity, agency, house rules", () => {
    const findings = readWarden({ "fact:0": noul(0.9), agency: scored(3.4), "rule:0": noul(0.9) }, all);
    expect(findings.map((finding) => finding.family)).toEqual(["continuity", "agency", "house-rule"]);
  });

  it("records what each family answered in the ring summary", () => {
    expect(wardenRecordP({ "fact:0": noul(0.9) }, input({ facts: ["F."] }))).toEqual({ facts: 1, flagged: 1 });
    expect(wardenRecordP({ agency: scored(3.1234), "rule:0": noul(0.9) }, input({ agency: { player: "M", message: "x" }, houseRules: ["R."] }))).toEqual({ facts: 0, flagged: 0, agency: 3.123, rules: 1, broken: 1 });
    expect(wardenRecordP(null, input({ agency: { player: "M", message: "x" } }))).toEqual({ facts: 0, flagged: 0, agency: -1 });
  });
});

describe("Phase A fixtures (labelled before any answer was read)", () => {
  it("agency: >= 40 rows, group replies in both families, the predeclared floors", () => {
    const data = fixture<AgencyCase>("agency.json");
    expect(data.floors).toEqual({ writes: 0.85, clean: 0.95 });
    expect(data.labelledAt).toBe("2026-09-25");
    expect(data.rows.length).toBeGreaterThanOrEqual(40);
    for (const family of ["writes", "clean"] as const) expect(data.rows.filter((row) => row.family === family && row.group).length).toBeGreaterThan(0);
    expect(data.rows.every((row) => (row.family === "writes") === (row.level >= 3))).toBe(true);
    expect(data.rows.filter((row) => row.source?.startsWith("record:")).length).toBeGreaterThan(0);
    expect(new Set(data.rows.map((row) => row.id)).size).toBe(data.rows.length);
  });

  it("house rules: >= 40 (reply, rule) rows over >= 12 rules, the predeclared floors", () => {
    const data = fixture<HouseRuleCase>("house-rules.json");
    expect(data.floors).toEqual({ broken: 0.85, kept: 0.95, untouched: 0.966 });
    const rows = data.rows.reduce((sum, row) => sum + row.rules.length, 0);
    expect(rows).toBeGreaterThanOrEqual(40);
    expect(new Set(data.rows.flatMap((row) => row.rules)).size).toBeGreaterThanOrEqual(12);
    expect(data.rows.every((row) => row.rules.length <= WARDEN_MAX_RULES && row.broken.every((index) => !row.kept.includes(index)))).toBe(true);
  });

  it("continuity-combined carries the continuity rows and labels verbatim, only adding the other families", () => {
    const combined = fixture<CombinedContinuityCase>("continuity-combined.json");
    const plain = fixture<CombinedContinuityCase>("continuity.json");
    expect(combined.floors).toEqual(plain.floors);
    expect(combined.rows.map(({ id, established, reply: text, contradicts }) => ({ id, established, reply: text, contradicts }))).toEqual(plain.rows.map(({ id, established, reply: text, contradicts }) => ({ id, established, reply: text, contradicts })));
    expect(combined.rows.every((row) => typeof row.playerMessage === "string" && (row.houseRules ?? []).length > 0)).toBe(true);
  });
});

describe("Phase A runners (stub judge)", () => {
  const asked: JudgeRequest[] = [];
  const stub = (answer: (request: JudgeRequest) => Record<string, JudgeAnswer> | null) => async (request: JudgeRequest) => {
    asked.push(request);
    return result(answer(request));
  };
  beforeEach(() => { asked.length = 0; });

  it("agency rows are <case>.<family>, right when the raw score falls on the labelled side", async () => {
    const cases: AgencyCase[] = [
      { id: "X1", lang: "en", player: "Max", playerMessage: "I wait.", reply, family: "writes", level: 4 },
      { id: "X2", lang: "en", player: "Max", playerMessage: "I wait.", reply, family: "clean", level: 0 },
      { id: "X3", lang: "en", player: "Max", playerMessage: "I wait.", reply, family: "clean", level: 0 },
    ];
    const scores: Record<string, number> = { "Arin shrugs.": 3 };
    const report = await runAgencyCalibration(stub(() => ({ agency: scored(scores[reply.text]) })), cases);
    expect(report.rows.map((row) => [row.id, row.right])).toEqual([["X1.writes", true], ["X2.clean", false], ["X3.clean", false]]);
    expect(asked[0].state).toEqual({ reply, player: "Max", player_message: "I wait." });
    const unanswered = await runAgencyCalibration(stub(() => null), cases.slice(1, 2));
    expect(unanswered.rows[0]).toMatchObject({ right: false, picked: null });
  });

  it("house-rule rows are broken/kept/untouched per rule", async () => {
    const cases: HouseRuleCase[] = [{ id: "H", lang: "en", rules: ["A.", "B.", "C."], reply, broken: [0], kept: [1] }];
    const report = await runHouseRuleCalibration(stub(() => ({ "rule:0": noul(0.9), "rule:1": noul(0.1), "rule:2": noul(0.8) })), cases);
    expect(report.rows.map((row) => [row.id, row.right])).toEqual([["H.broken:0", true], ["H.kept:1", true], ["H.untouched:2", false]]);
    expect(judgeFamilyScores(report, { broken: 0.85, kept: 0.95, untouched: 0.966 }).map((row) => row.ok)).toEqual([true, true, false]);
  });

  it("combined continuity asks the continuity rows inside the full warden request and scores only continuity", async () => {
    const cases: CombinedContinuityCase[] = [{ id: "C", lang: "en", established: ["F0.", "F1."], reply, contradicts: [1], player: "Max", playerMessage: "I look.", houseRules: ["No guns."] }];
    const report = await runCombinedContinuityCalibration(stub(() => ({ "fact:0": noul(0.1), "fact:1": noul(0.9), agency: scored(4), "rule:0": noul(0.99) })), cases);
    expect(Object.keys(asked[0].questions)).toEqual(["fact:0", "fact:1", "agency", "rule:0"]);
    expect(report.rows.map((row) => [row.id, row.right])).toEqual([["C.reply", true], ["C.consistent:0", true], ["C.broken:1", true]]);
  });

  it("rescore asks only the rows the family can hold, and reports the agency score", async () => {
    const rows = [
      { id: "m1", arm: "on", established: [], reply, player: "Max", playerMessage: "I wait." },
      { id: "m2", arm: "off", established: [], reply },
    ];
    const agency = await runWardenRescore(stub(() => ({ agency: scored(3.2) })), "agency", rows);
    expect(agency).toEqual([expect.objectContaining({ id: "m1", flagged: true, score: 3.2 })]);
    const rules = await runWardenRescore(stub(() => ({ "rule:0": noul(0.9) })), "house-rules", [{ ...rows[1], houseRules: ["No guns."] }]);
    expect(rules).toEqual([expect.objectContaining({ id: "m2", flagged: true, broken: ["No guns."] })]);
    const continuity = await runWardenRescore(stub(() => ({ "fact:0": noul(0.1) })), "continuity", [{ ...rows[1], established: ["F."] }, rows[0]]);
    expect(continuity).toEqual([expect.objectContaining({ id: "m2", flagged: false })]);
  });
});

describe("Phase A goldens (recorded 2026-09-25 on jev-1.13.0, replayed with no judge)", () => {
  const golden = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge", name), "utf8")) as { model: string; right: number; total: number; calls: Array<{ state: unknown; questions: unknown; answers: Record<string, JudgeAnswer> }> };
  const replay = (name: string) => {
    const byRequest = new Map(golden(name).calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
    return async (request: JudgeRequest) => result(byRequest.get(JSON.stringify([request.state, request.questions])) ?? null);
  };
  const cases: Array<[string, (ask: ReturnType<typeof replay>, rows: never[]) => Promise<JudgeSelfTestReport>, Record<string, [number, number]>]> = [
    ["agency.json", (ask, rows) => runAgencyCalibration(ask, rows), { writes: [18, 18], clean: [23, 23] }],
    ["house-rules.json", (ask, rows) => runHouseRuleCalibration(ask, rows), { broken: [14, 15], kept: [11, 11], untouched: [53, 54] }],
    ["continuity-combined.json", (ask, rows) => runCombinedContinuityCalibration(ask, rows), { reply: [22, 23], broken: [11, 12], consistent: [32, 32] }],
  ];
  it("adolion-house-rules.json (campaign lab, new {{user}} wording, recorded 2026-10-01): replays to the recorded score, below the broken and untouched floors", async () => {
    const data = fixture<never>("adolion-house-rules.json");
    const record = golden("adolion-house-rules.json");
    const report = await runHouseRuleCalibration(replay("adolion-house-rules.json"), data.rows);
    expect(record.model).toBe("jev-1.13.0");
    expect(report.rows.filter((row) => row.picked === null)).toEqual([]);
    expect([report.right, report.total]).toEqual([187, 200]);
    const families = judgeFamilyScores(report, data.floors);
    expect(Object.fromEntries(families.map((row) => [row.family, [row.right, row.total, row.ok]]))).toEqual({ broken: [12, 18, false], kept: [10, 10, true], untouched: [165, 172, false] });
  });
  for (const [name, run, measured] of cases) {
    it(`${name}: replays every row to the recorded score and clears every predeclared floor`, async () => {
      const data = fixture<never>(name);
      const record = golden(name);
      const report = await run(replay(name), data.rows);
      expect(record.model).toBe("jev-1.13.0");
      expect(report.rows.filter((row) => row.picked === null)).toEqual([]);
      expect([report.right, report.total]).toEqual([record.right, record.total]);
      const families = judgeFamilyScores(report, data.floors);
      expect(Object.fromEntries(families.map((row) => [row.family, [row.right, row.total]]))).toEqual(measured);
      expect(families.filter((row) => !row.ok)).toEqual([]);
    });
  }
});

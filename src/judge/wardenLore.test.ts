import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LORE_CONTENT_CHARS, WARDEN_LORE_P, WARDEN_MAX_LORE } from "./policy";
import { validateJudgeRequest } from "./questions";
import { judgeFamilyScores } from "./selfTest";
import type { JudgeAnswer, JudgeRequest, JudgeResult } from "./types";
import { buildWardenRequests, readWarden, readWardenLore, wardenFamiliesAsked, wardenRecordP, type WardenInput } from "./warden";
import { runWardenLoreCalibration, type WardenLoreCase } from "./wardenCalibration";

const reply = { speaker: "Arin", text: "The old bridge still stands, and we cross it at dawn." };
const noul = (p: number): JudgeAnswer => ({ type: "noul", noul: p });
const input = (over: Partial<WardenInput> = {}): WardenInput => ({ reply, facts: [], agency: null, houseRules: [], ...over });
const result = (answers: Record<string, JudgeAnswer> | null): JudgeResult => ({ answers, model: "jev-1.13.0", latencyMs: 5, stateChars: 0, questionCount: 0, cached: false });
const fixture = () => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge/warden-lore.json"), "utf8")) as { floors: Record<string, number>; rows: WardenLoreCase[] };

describe("L7 warden request with the lore family (Phase A shape)", () => {
  it("asks one noul per fired story-lore entry after the other families, capped at 8 entries x 600 chars; the runtime family list is unchanged until the build", () => {
    const lore = Array.from({ length: WARDEN_MAX_LORE + 2 }, (_, index) => ({ comment: `Entry ${index}`, text: `${"x".repeat(LORE_CONTENT_CHARS + 50)}` }));
    const [request, ...rest] = buildWardenRequests(input({ facts: ["F."], houseRules: ["No guns."], lore }));
    expect(rest).toEqual([]);
    expect(Object.keys(request.questions)).toEqual(["fact:0", "rule:0", ...Array.from({ length: WARDEN_MAX_LORE }, (_, index) => `lore:${index}`)]);
    const state = request.state.lore as Record<string, { title: string; text: string }>;
    expect(Object.keys(state)).toHaveLength(WARDEN_MAX_LORE);
    expect(Object.values(state).every((entry) => entry.text.length === LORE_CONTENT_CHARS)).toBe(true);
    expect(request.questions["lore:0"].instructions).toBe("Does `reply` contradict `lore.entry_0`?");
    expect(validateJudgeRequest(request)).toEqual([]);
    expect(wardenFamiliesAsked(input({ lore }))).toEqual([]);
  });

  it("asks nothing for lore when none fired, so today's request is unchanged", () => {
    expect(JSON.stringify(buildWardenRequests(input({ facts: ["F."], lore: [] })))).toBe(JSON.stringify(buildWardenRequests(input({ facts: ["F."] }))));
  });

  it("names a contradicted entry by its title at the predeclared 0.7, and records the counts", () => {
    const lore = [{ comment: "Bridge", text: "The old bridge fell in the spring floods." }, { comment: "Dawn", text: "Dawn comes late in winter." }];
    const finding = readWardenLore({ "lore:0": noul(WARDEN_LORE_P), "lore:1": noul(0.2) }, input({ lore }));
    expect(finding).toEqual(expect.objectContaining({ family: "lore", lore: ["Bridge"] }));
    expect(finding?.text).toContain("Bridge");
    expect(readWardenLore({ "lore:0": noul(WARDEN_LORE_P - 0.01) }, input({ lore }))).toBeNull();
    expect(readWarden({ "lore:0": noul(0.99) }, input({ lore }))).toEqual([]);
    expect(wardenRecordP({ "lore:0": noul(0.9), "lore:1": noul(0.1) }, input({ lore }))).toMatchObject({ lore: 2, contradicted: 1 });
  });
});

describe("L7 Phase A fixture and runner", () => {
  it("warden-lore: 18 cases (26 before v2.6 W25 removed the Spanish ones), >= 3 real replies from records, negation pairs, untouched replies, the predeclared floors", () => {
    const data = fixture();
    expect(data.floors).toEqual({ contradicts: 0.85, consistent: 0.966, untouched: 0.966 });
    expect(data.rows).toHaveLength(18);
    expect(data.rows.filter((row) => row.source?.startsWith("record:")).length).toBeGreaterThanOrEqual(3);
    expect(data.rows.filter((row) => row.pair).length).toBeGreaterThanOrEqual(4);
    expect(data.rows.filter((row) => !row.contradicts.length && !row.consistent.length)).toHaveLength(2);
    expect(data.rows.every((row) => row.lore.length <= WARDEN_MAX_LORE && row.contradicts.every((index) => !row.consistent.includes(index) && index < row.lore.length))).toBe(true);
    expect(new Set(data.rows.map((row) => row.id)).size).toBe(data.rows.length);
  });

  const asked: JudgeRequest[] = [];
  const stub = (answer: (request: JudgeRequest) => Record<string, JudgeAnswer> | null) => async (request: JudgeRequest) => {
    asked.push(request);
    return result(answer(request));
  };
  const cases: WardenLoreCase[] = [{ id: "W", lang: "en", lore: [{ comment: "A", text: "A." }, { comment: "B", text: "B." }, { comment: "C", text: "C." }], reply, contradicts: [0], consistent: [1] }];

  it("rows are contradicts/consistent/untouched per entry", async () => {
    const report = await runWardenLoreCalibration(stub(() => ({ "lore:0": noul(0.9), "lore:1": noul(0.1), "lore:2": noul(0.8) })), cases);
    expect(report.rows.map((row) => [row.id, row.right])).toEqual([["W.contradicts:0", true], ["W.consistent:1", true], ["W.untouched:2", false]]);
  });

  it("R3 facts arm: the same entries asked as established facts, scored on the same labels", async () => {
    asked.length = 0;
    const report = await runWardenLoreCalibration(stub(() => ({ "fact:0": noul(0.9), "fact:1": noul(0.1), "fact:2": noul(0.1) })), cases, "facts");
    expect(Object.keys(asked[0].questions)).toEqual(["fact:0", "fact:1", "fact:2"]);
    expect(report.rows.every((row) => row.right)).toBe(true);
  });

  it("negative control: the fixture scored with the lore removed from the input falls below R1", async () => {
    const data = fixture();
    const report = await runWardenLoreCalibration(stub(() => ({})), data.rows, "none");
    const contradicts = judgeFamilyScores(report, data.floors).find((row) => row.family === "contradicts");
    expect(contradicts?.ok).toBe(false);
  });
});

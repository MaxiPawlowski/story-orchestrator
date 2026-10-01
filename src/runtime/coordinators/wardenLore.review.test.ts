import { readFileSync } from "node:fs";
import { join } from "node:path";
import { plantedModel } from "../../../test/support/modelCall";
import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import {
  AUTHOR_JUDGE_USES, BUILT_JUDGE_USES, defaultJudgeSettings, JUDGE_READINESS, JUDGE_USE_COPY, judgeReadiness, sanitizeJudgeSettings,
  type JudgeAnswer, type JudgeCallRecord, type JudgeRequest, type JudgeSettings,
} from "@judge/index";
import { wardenFlagJournal, type WardenCheckFinding, type WardenCheckInput, type WardenNoteOp } from "@stagecraft/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft } from "../extras";
import { createWarden, wardenFamilies } from "../continuity";
import { JudgeRuntime } from "../judge";
import type { StagecraftRuntimeState } from "../types";
import { testOwnership } from "../../../test/findings/testOwnership";

interface LoreCase { id: string; lore: Array<{ comment: string; text: string }>; reply: { speaker: string; text: string }; contradicts: number[]; consistent: number[]; pair?: string }

const ROOT = join(__dirname, "../../..");
const fixture = JSON.parse(readFileSync(join(ROOT, "test/fixtures/judge/warden-lore.json"), "utf8")) as { floors: Record<string, number>; rows: LoreCase[] };
const golden = JSON.parse(readFileSync(join(ROOT, "test/goldens/judge/warden-lore.calibration.json"), "utf8")) as {
  summary: { right: number; total: number; rate: number; p50LatencyMs: number; model: string; families: Array<{ family: string; right: number; total: number; floor: number; ok: boolean }> };
  rows: Array<{ id: string; picked: string }>;
};
const goldenP = (caseId: string, index: number): number => {
  const row = golden.rows.find((entry) => entry.id.startsWith(`${caseId}.`) && entry.id.endsWith(`:${index}`));
  if (!row) throw new Error(`golden has no row for ${caseId}:${index}`);
  return Number(row.picked.replace("p=", ""));
};
const caseOf = (id: string): LoreCase => {
  const row = fixture.rows.find((entry) => entry.id === id);
  if (!row) throw new Error(`fixture has no case ${id}`);
  return row;
};

const RULES = ["No character uses a gun."];
const story = (): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2, id: "warden-lore", title: "Lore", description: "Warden lore.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }],
  transitions: [], roster: [], house_rules: RULES,
});
const engineState = { activeCheckpointId: "cp1", boundary: 3, lastMessageId: 1 } as unknown as EngineState;
const view = { getStory: () => story(), getState: () => engineState };

type Answerer = (request: JudgeRequest) => Record<string, JudgeAnswer> | Error;
const judgeWith = (uses: Partial<JudgeSettings["uses"]>, answer: Answerer, enabled = true) => {
  const off = Object.fromEntries(Object.keys(defaultJudgeSettings().uses).map((key) => [key, false])) as JudgeSettings["uses"];
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled, uses: { ...off, ...uses } };
  const requests: JudgeRequest[] = [];
  const records: JudgeCallRecord[] = [];
  const judge = new JudgeRuntime({
    ownership: testOwnership(),
    getSettings: () => settings,
    transport: async (request) => {
      requests.push(request);
      const answers = answer(request);
      if (answers instanceof Error) throw answers;
      return { model: "jev-1.13.0", answers };
    },
    status: async () => ({ configured: true }),
    record: (record) => { records.push(record); },
    context: () => ({ boundary: 1, messageId: 1 }),
  });
  return { judge, requests, records };
};

const noul = (p: number): JudgeAnswer => ({ type: "noul", noul: p });
const loreAnswers = (row: LoreCase): Answerer => (request) => Object.fromEntries(Object.keys(request.questions).map((key) => {
  const [family, index] = key.split(":");
  return [key, noul(family === "lore" ? goldenP(row.id, Number(index)) : 0.05)];
}));
const isLoreRequest = (request: JudgeRequest) => Object.keys(request.questions).some((key) => key.startsWith("lore:"));
const input = (row: LoreCase, extra: Partial<WardenCheckInput> = {}): WardenCheckInput => ({ reply: row.reply, facts: [], agency: null, houseRules: [], lore: row.lore, ...extra });
const warden = (judge: JudgeRuntime) => createWarden(() => judge, view, { facts: () => [], nudgeActive: () => false });

describe("warden-lore: the judge use", () => {
  it("is its own install-wide switch, on by default like every use, author-only, with copy that names what it sends", () => {
    expect(defaultJudgeSettings().uses.wardenLore).toBe(true);
    expect(sanitizeJudgeSettings({ uses: { wardenLore: false } }).uses.wardenLore).toBe(false);
    expect(sanitizeJudgeSettings({}).uses.wardenLore).toBe(true);
    expect(BUILT_JUDGE_USES).toContain("wardenLore");
    expect(AUTHOR_JUDGE_USES).toContain("wardenLore");
    expect(JUDGE_USE_COPY.wardenLore.label).toBe("Lore check (warden)");
    expect(JUDGE_USE_COPY.wardenLore.sends).toMatch(/lore entr/);
  });

  it("readiness carries the measured golden: rate, p50, model, and every family at its predeclared floor", () => {
    expect(golden.summary.families.map((family) => [family.family, family.right, family.total, family.floor])).toEqual([
      ["contradicts", 14, 14, fixture.floors.contradicts],
      ["consistent", 15, 15, fixture.floors.consistent],
      ["untouched", 31, 31, fixture.floors.untouched],
    ]);
    expect(golden.summary.families.every((family) => family.ok && family.right / family.total >= family.floor)).toBe(true);
    expect(JUDGE_READINESS.wardenLore).toMatchObject({ calibration: golden.summary.rate, latencyP50Ms: golden.summary.p50LatencyMs, measuredOn: golden.summary.model });
    const settings = { ...defaultJudgeSettings(), enabled: true };
    expect(judgeReadiness(settings).find((row) => row.key === "wardenLore")).toMatchObject({ verdict: "measured", enabled: true });
  });
});

describe("warden-lore: wiring (runtime/continuity.ts)", () => {
  it("the lore family is on only with the judge on and its own use on", () => {
    const answer: Answerer = () => ({});
    expect(wardenFamilies(() => judgeWith({ wardenLore: true }, answer).judge, view)().lore).toBe(true);
    expect(wardenFamilies(() => judgeWith({ wardenLore: false }, answer).judge, view)().lore).toBe(false);
    expect(wardenFamilies(() => judgeWith({ wardenLore: true }, answer, false).judge, view)().lore).toBe(false);
  });

  it("use on: the fired lore goes in its own call under its own use, and a contradicted entry is flagged by title", async () => {
    const row = caseOf("L27");
    const env = judgeWith({ wardenLore: true, houseRules: true }, loreAnswers(row));
    const findings = await warden(env.judge).check(input(row, { houseRules: RULES }));
    expect(env.requests).toHaveLength(2);
    const [rules, lore] = [env.requests.find((request) => !isLoreRequest(request))!, env.requests.find(isLoreRequest)!];
    expect(Object.keys(rules.questions)).toEqual(["rule:0"]);
    expect(Object.keys(lore.questions)).toEqual(["lore:0", "lore:1"]);
    expect(env.records.map((record) => record.use).sort()).toEqual(["warden", "wardenLore"]);
    expect(findings).toEqual([expect.objectContaining({ family: "lore", facts: [], lore: ["Arryn"] })]);
    expect(findings?.[0].text).toContain("Arryn");
  });

  it("use off: no lore reaches the judge, and the request is today's byte for byte", async () => {
    const row = caseOf("L27");
    const without = judgeWith({ houseRules: true }, loreAnswers(row));
    await warden(without.judge).check(input(row, { houseRules: RULES, lore: [] }));
    const today = judgeWith({ houseRules: true }, loreAnswers(row));
    await warden(today.judge).check({ reply: row.reply, facts: [], agency: null, houseRules: RULES });
    expect(JSON.stringify(without.requests)).toBe(JSON.stringify(today.requests));
    expect(without.records.map((record) => record.use)).toEqual(["warden"]);
  });

  it("a lore call that fails falls back to today's path: the other families still answer, nothing is said about lore", async () => {
    const row = caseOf("L27");
    const failing: Answerer = (request) => (isLoreRequest(request) ? new Error("upstream 500") : { "rule:0": noul(0.9) });
    const env = judgeWith({ wardenLore: true, houseRules: true }, failing);
    const findings = await warden(env.judge).check(input(row, { houseRules: RULES }));
    expect(findings?.map((finding) => finding.family)).toEqual(["house-rule"]);
    expect(env.records.find((record) => record.use === "wardenLore")?.fallback).toBe("error");
    const alone = judgeWith({ wardenLore: true }, failing);
    expect(await warden(alone.judge).check(input(row))).toBeNull();
  });

  it("the judge master switch off sends nothing at all", async () => {
    const row = caseOf("L27");
    const env = judgeWith({ wardenLore: true }, loreAnswers(row), false);
    expect(await warden(env.judge).check(input(row))).toBeNull();
    expect(env.requests).toEqual([]);
  });

  it("negation pair L27/L28: the bow is flagged against Arryn's lore, the lance is not", async () => {
    const bow = caseOf("L27");
    const lance = caseOf("L28");
    expect(bow.pair).toBe(lance.pair);
    const flagged = await warden(judgeWith({ wardenLore: true }, loreAnswers(bow)).judge).check(input(bow));
    const clean = await warden(judgeWith({ wardenLore: true }, loreAnswers(lance)).judge).check(input(lance));
    expect(flagged?.map((finding) => finding.lore)).toEqual([["Arryn"]]);
    expect(clean).toEqual([]);
  });

  it("golden replay: every one of the 26 measured cases flags exactly its contradicted entries through the runtime path", async () => {
    expect(fixture.rows).toHaveLength(26);
    for (const row of fixture.rows) {
      const findings = await warden(judgeWith({ wardenLore: true }, loreAnswers(row)).judge).check(input(row));
      const flagged = (findings ?? []).flatMap((finding) => finding.lore ?? []).sort();
      expect([row.id, flagged]).toEqual([row.id, row.contradicts.map((index) => row.lore[index].comment).sort()]);
    }
  });
});

describe("warden-lore: the warden pass (stagecraftCoordinator)", () => {
  const chat: Array<Record<string, unknown>> = [];
  const host = {
    setStoryExtensionPrompt: jest.fn(), clearStoryExtensionPrompt: jest.fn(), loadLorebook: jest.fn(), readWIEntry: jest.fn(), readWIEntryAt: jest.fn(),
    restoreWIEntryAt: jest.fn(), upsertWIEntry: jest.fn(), enableWIEntry: jest.fn(), disableWIEntry: jest.fn(), getPlayerName: () => "Max",
  };
  const LORE = [{ comment: "Arryn", text: "Arryn has never used a bow." }];
  const loreFinding: WardenCheckFinding = { family: "lore", text: 'Lore: "Arryn" says Arryn has never used a bow. — keep the next reply consistent with it.', facts: [], lore: ["Arryn"] };
  const harness = (options: { continuity: boolean; lore: boolean; findings?: WardenCheckFinding[] | null; mode?: "auto" | "review" }) => {
    let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { curatorEnabled: false, acceptMode: "review", wardenEnabled: options.continuity, wardenAcceptMode: options.mode ?? "auto" } };
    const inputs: WardenCheckInput[] = [];
    const asked: number[] = [];
    const families = { agency: false, houseRules: [] as string[], lore: options.lore };
    const journal: Array<[string, string | undefined]> = [];
    const coordinator = new StagecraftCoordinator({
      hosts: { prompt: host, chat: { chatRows: () => chat }, player: host, curator: host } as never, ownership: testOwnership(),
      getStory: () => story(), getState: () => engineState, getStagecraft: () => state, setStagecraft: (next) => { state = next; },
      model: plantedModel, getCanon: () => "", getOpenArcs: () => [],
      warden: {
        check: async (asked) => { inputs.push(asked); return options.findings === undefined ? [loreFinding] : options.findings; },
        facts: () => [{ id: "f", text: "The bridge fell." }],
        families: () => families,
        lore: (messageId: number) => { asked.push(messageId); return LORE; },
        nudgeActive: () => false,
      },
      journal: (summary, note) => { journal.push([summary, note]); },
      persist: async () => undefined, notify: () => undefined,
    } as StagecraftCoordinatorDeps);
    return { coordinator, inputs, asked, families, journal, read: () => state };
  };

  beforeEach(() => {
    chat.splice(0, chat.length, { name: "Max", mes: "I watch.", is_user: true }, { name: "Narrator", mes: "Arryn draws a longbow.", is_user: false });
    host.setStoryExtensionPrompt.mockClear();
  });

  it("asks with the lore that fired for THIS reply, records a lore note, and the next generation carries it", async () => {
    const env = harness({ continuity: true, lore: true });
    expect(await env.coordinator.runWardenPass(1)).toBe(true);
    expect(env.asked).toEqual([1]);
    expect(env.inputs[0].lore).toEqual(LORE);
    const record = env.read().proposals.at(-1)!;
    expect(record).toMatchObject({ reason: "lore", summary: "Narrator's reply contradicts a lore entry", ops: [{ status: "accepted", op: { kind: "note", family: "lore", lore: ["Arryn"] } }] });
    expect(env.journal[0]).toEqual(["Warden flagged Narrator's reply (lore)", "Arryn"]);
    env.coordinator.onGenerationStarted("normal", false);
    expect(host.setStoryExtensionPrompt).toHaveBeenCalledWith("story_orchestrator_continuity", loreFinding.text, 0);
  });

  it("needs the continuity warden: with it off, the lore family neither asks nor injects", async () => {
    const env = harness({ continuity: false, lore: true });
    expect(await env.coordinator.runWardenPass(1)).toBe(false);
    expect(env.asked).toEqual([]);
    expect(env.inputs).toEqual([]);
  });

  it("use off: today's input exactly, no lore read, and an accepted lore note stays out of the prompt", async () => {
    const env = harness({ continuity: true, lore: false, findings: null });
    await env.coordinator.runWardenPass(1);
    expect(env.asked).toEqual([]);
    expect(env.inputs).toEqual([{ reply: { speaker: "Narrator", text: "Arryn draws a longbow." }, facts: ["The bridge fell."], agency: null, houseRules: [] }]);
    const on = harness({ continuity: true, lore: true });
    await on.coordinator.runWardenPass(1);
    on.families.lore = false;
    on.coordinator.onGenerationStarted("normal", false);
    expect(host.setStoryExtensionPrompt).not.toHaveBeenCalled();
  });

  it("journal parity: a lore finding names its entries the way a house rule names its rules", () => {
    expect(wardenFlagJournal("Narrator", [loreFinding])).toEqual(["Warden flagged Narrator's reply (lore)", "Arryn"]);
    const op: WardenNoteOp = { kind: "note", family: "lore", text: loreFinding.text, facts: [], replyMessageId: 1, lore: ["Arryn"] };
    expect(op.lore).toEqual(["Arryn"]);
  });
});

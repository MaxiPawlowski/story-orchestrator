const queued: Array<{ text: string; finish: string }> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  sendConnectionProfileRequest: jest.fn(async () => {
    const next = queued.shift();
    if (!next) throw new Error("no queued response");
    return { ok: true, text: next.text, finish: next.finish };
  }),
}));

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateProposal } from "@copilot/index";
import type { StoryV2 } from "@engine/index";
import {
  allowedStageKinds,
  runRoleCase,
  scoreAuthoring,
  scoreCurator,
  scoreDirector,
  scoreSynthesis,
  summarizeRoleCalibration,
  type AuthoringCalibrationCase,
  type CalibrationRole,
  type CuratorCalibrationCase,
  type DirectorCalibrationCase,
  type RoleCaseRecord,
} from "./roleCalibration";
import { renderStagePrompt } from "@copilot/index";

const ROOT = process.cwd();
const read = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const curatorFixture = read("test/fixtures/role-calibration/curator.json");
const authoringFixture = read("test/fixtures/role-calibration/authoring.json");
const synthesisFixture = read("test/fixtures/role-calibration/synthesis.json");
const directorFixture = read("test/fixtures/judge/director.json");

const authoringCase = (entry: Record<string, unknown>): AuthoringCalibrationCase => ({
  ...(entry as unknown as AuthoringCalibrationCase),
  draft: authoringFixture.drafts[entry.draft as string] as StoryV2,
  ...(entry.stage === "provisioning" ? { environment: authoringFixture.environment } : {}),
});

describe("role calibration fixtures (labels frozen before any model answer)", () => {
  it("curator: 20 cases, 8 Spanish, the declared floors, unique ids, labels consistent", () => {
    const cases: CuratorCalibrationCase[] = curatorFixture.cases;
    expect(cases).toHaveLength(20);
    expect(cases.filter((entry) => entry.lang === "es")).toHaveLength(8);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(20);
    expect(curatorFixture.floors).toEqual({ validity: 0.9, opShape: 0.85, decision: 0.7 });
    for (const entry of cases) {
      const titles = entry.scope.entries.map((item) => item.comment);
      expect(entry.label === "none" ? entry.required : entry.required.length > 0).toBeTruthy();
      for (const item of entry.required) expect(titles).toContain(item.comment);
      for (const title of entry.forbidden) expect(titles).toContain(title);
      for (const item of entry.required.filter((required) => required.kinds.includes("enable"))) expect(entry.scope.entries.find((view) => view.comment === item.comment)?.disabled).toBe(true);
    }
  });

  it("authoring: 20 cases, 8 Spanish, every base draft validates clean, every required kind is allowed by its stage", () => {
    const cases = (authoringFixture.cases as Array<Record<string, unknown>>).map(authoringCase);
    expect(cases).toHaveLength(20);
    expect(cases.filter((entry) => entry.lang === "es")).toHaveLength(8);
    expect(authoringFixture.floors).toEqual({ validity: 0.9, opShape: 0.8 });
    for (const entry of cases) {
      expect(validateProposal(entry.draft, []).blocking).toEqual([]);
      expect(allowedStageKinds(renderStagePrompt(entry.stage, entry.draft, entry.message, [], entry.environment))).toContain(entry.require.kind);
    }
  });

  it("synthesis: 8 cases, 3 Spanish, no floor", () => {
    expect(synthesisFixture.cases).toHaveLength(8);
    expect(synthesisFixture.cases.filter((entry: { lang: string }) => entry.lang === "es")).toHaveLength(3);
    expect(synthesisFixture.floors).toBeUndefined();
  });

  it("director: the floored rows are D01-D26", () => {
    expect(directorFixture.rows.slice(0, 26).map((row: { id: string }) => row.id)).toEqual(Array.from({ length: 26 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`));
  });
});

const director = (overrides: Partial<DirectorCalibrationCase> = {}): DirectorCalibrationCase => ({
  id: "X",
  acceptable: ["Ponticius"],
  input: {
    storyTitle: "T",
    checkpointName: "C",
    objective: "O",
    candidates: [{ rosterId: "ponticius", name: "Ponticius" }, { rosterId: "arin", name: "Arin" }],
    allowSilence: false,
    window: [{ speaker: "Max", text: "Ponticius?" }],
  },
  ...overrides,
});

describe("scoreDirector", () => {
  it("a parsed acceptable pick in time is correct", () => {
    expect(scoreDirector(director(), "SPEAKER: Ponticius", 900)).toEqual({ pick: "Ponticius", answerCorrect: true, inTime: true, correct: true });
  });
  it("a reply slower than the production timeout is not correct, even when right", () => {
    expect(scoreDirector(director(), "SPEAKER: Ponticius", 20001).correct).toBe(false);
  });
  it("an unparsed or wrong answer is not correct; NONE only counts when silence is allowed", () => {
    expect(scoreDirector(director(), "I think Arin", 10).pick).toBeNull();
    expect(scoreDirector(director(), "SPEAKER: Arin", 10).correct).toBe(false);
    expect(scoreDirector(director({ acceptable: ["NONE"], input: { ...director().input, allowSilence: true } }), "SPEAKER: NONE", 10).correct).toBe(true);
  });
});

const curatorCase: CuratorCalibrationCase = curatorFixture.cases.find((entry: CuratorCalibrationCase) => entry.id === "c11");
const noneCase: CuratorCalibrationCase = curatorFixture.cases.find((entry: CuratorCalibrationCase) => entry.id === "c04");

describe("scoreCurator", () => {
  it("every required item kept with an allowed kind is a correct decision", () => {
    const score = scoreCurator(curatorCase, "[enable] The Vault\n[disable] Guard Rotation\n[why] they got in");
    expect(score).toMatchObject({ valid: true, opLines: 2, survived: 2, decision: true });
  });
  it("a missing required item is a wrong decision but a valid, well-shaped reply", () => {
    expect(scoreCurator(curatorCase, "[enable] The Vault")).toMatchObject({ valid: true, opLines: 1, survived: 1, decision: false });
  });
  it("an op naming an unknown entry counts against shape; an op the planner refuses does too", () => {
    expect(scoreCurator(curatorCase, "[enable] The Moon\n[enable] Guard Rotation")).toMatchObject({ opLines: 2, survived: 0 });
  });
  it("NONE is valid and the right answer on a none case; any kept record fails it", () => {
    expect(scoreCurator(noneCase, "NONE")).toMatchObject({ valid: true, opLines: 0, decision: true });
    expect(scoreCurator(noneCase, "[disable] Oskar").decision).toBe(false);
  });
  it("touching a forbidden entry fails a change case", () => {
    const withForbidden = { ...curatorCase, forbidden: ["Guard Rotation"] };
    expect(scoreCurator(withForbidden, "[enable] The Vault\n[disable] Guard Rotation").decision).toBe(false);
  });
  it("prose with no op line and no NONE is invalid", () => {
    expect(scoreCurator(noneCase, "Everything looks fine to me.").valid).toBe(false);
  });
});

describe("scoreAuthoring", () => {
  const qualities = authoringCase(authoringFixture.cases.find((entry: { id: string }) => entry.id === "a01"));
  const thin = authoringCase(authoringFixture.cases.find((entry: { id: string }) => entry.id === "a04"));
  const add = (type: string) => ({ kind: "addQuality" as const, quality: { key: "alarm", type, source: "extractor", rubric: "Is the alarm tripped?" } }) as never;
  it("reads the allowed kinds from the stage prompt", () => {
    expect(allowedStageKinds(renderStagePrompt("qualities", qualities.draft, "", []))).toEqual(["setStoryField", "addQuality", "updateQuality", "removeQuality"]);
  });
  it("ok with the required kind and match is well-shaped", () => {
    expect(scoreAuthoring(qualities, "ok", [add("bool")], false, [])).toMatchObject({ valid: true, shape: true });
  });
  it("the wrong type, a kind the stage forbids, or a failed status is not", () => {
    expect(scoreAuthoring(qualities, "ok", [add("int")], false, []).shape).toBe(false);
    expect(scoreAuthoring(qualities, "ok", [add("bool"), { kind: "removeCheckpoint", id: "vault" } as never], false, []).shape).toBe(false);
    expect(scoreAuthoring(qualities, "failed", [add("bool")], true, ["x"])).toMatchObject({ valid: false, shape: false });
  });
  it("questions are valid, and well-shaped only where the premise was labelled thin", () => {
    expect(scoreAuthoring(qualities, "questions", [], false, [])).toMatchObject({ valid: true, shape: false });
    expect(scoreAuthoring(thin, "questions", [], false, [])).toMatchObject({ valid: true, shape: true });
  });
});

describe("scoreSynthesis", () => {
  it("a plain summary is valid", () => {
    expect(scoreSynthesis("They went down into the tunnel.", "stop")).toEqual({ valid: true, empty: false, truncated: false, noise: false });
  });
  it("empty, cut off, or carrying a channel marker is not", () => {
    expect(scoreSynthesis("   ", "stop").valid).toBe(false);
    expect(scoreSynthesis("They went down", "length")).toMatchObject({ valid: false, truncated: true });
    expect(scoreSynthesis("They went <channel|> down.", "stop")).toMatchObject({ valid: false, noise: true });
  });
});

const record = <R extends CalibrationRole>(role: R, id: string, lang: string, score: RoleCaseRecord<R>["score"]): RoleCaseRecord => ({ role, id, lang, responses: [], finishes: [], latencyMs: 0, score }) as RoleCaseRecord;

describe("summarizeRoleCalibration", () => {
  it("director: the floor is 22 of D01-D26; Spanish rows are reported, never floored", () => {
    const rows = Array.from({ length: 33 }, (_, index) => record("director", `D${String(index + 1).padStart(2, "0")}`, index >= 26 ? "es" : "en", { pick: "A", answerCorrect: index >= 4, inTime: true, correct: index >= 4 }));
    const ids = rows.slice(0, 26).map((row) => row.id);
    const summary = summarizeRoleCalibration("director", rows, { floorIds: ids });
    expect(summary.overall.metrics.correct).toMatchObject({ passed: 22, total: 26, ok: true });
    expect(summary.es.metrics.correct).toMatchObject({ passed: 7, total: 7, ok: null });
    expect(summary.meetsFloors).toBe(true);
    const short = summarizeRoleCalibration("director", rows.map((row, index) => (index === 4 ? { ...row, score: { ...row.score, correct: false } } : row)), { floorIds: ids });
    expect(short.meetsFloors).toBe(false);
  });
  it("curator: every floor binds overall and on the Spanish slice", () => {
    const good = { valid: true, opLines: 1, survived: 1, decision: true, kept: [], dropped: [] };
    const rows = Array.from({ length: 20 }, (_, index) => record("curator", `c${index}`, index >= 12 ? "es" : "en", good));
    expect(summarizeRoleCalibration("curator", rows).meetsFloors).toBe(true);
    const esMiss = rows.map((row, index) => (index >= 12 && index < 15 ? { ...row, score: { ...good, decision: false } } : row));
    const summary = summarizeRoleCalibration("curator", esMiss);
    expect(summary.overall.metrics.decision.ok).toBe(true);
    expect(summary.es.metrics.decision).toMatchObject({ passed: 5, total: 8, ok: false });
    expect(summary.meetsFloors).toBe(false);
  });
  it("curator opShape is surviving records over op lines read", () => {
    const rows = [record("curator", "a", "en", { valid: true, opLines: 4, survived: 3, decision: true, kept: [], dropped: [] })];
    expect(summarizeRoleCalibration("curator", rows).overall.metrics.opShape).toMatchObject({ passed: 3, total: 4, rate: 0.75, ok: false });
  });
  it("synthesis has no floor", () => {
    const rows = [record("synthesis", "s", "en", { valid: false, empty: true, truncated: false, noise: false })];
    expect(summarizeRoleCalibration("synthesis", rows).meetsFloors).toBeNull();
  });
});

describe("recorded live goldens replay through the same run path", () => {
  const dir = join(ROOT, "test/goldens/live/role-calibration");
  const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".json")) : [];
  it(`found ${files.length} recorded golden(s)`, () => {
    expect(Array.isArray(files)).toBe(true);
  });
  for (const file of files) {
    it(`${file}: every case re-scores to the recorded score, and the summary to the recorded summary`, async () => {
      const golden = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const replayed: RoleCaseRecord[] = [];
      for (const entry of golden.records) {
        const byId = (list: Array<{ id: string }>) => list.find((item) => item.id === entry.id);
        if (golden.role === "curator") expect(entry.case).toEqual(byId(curatorFixture.cases));
        if (golden.role === "synthesis") expect(entry.case).toEqual(byId(synthesisFixture.cases));
        if (golden.role === "authoring") expect(entry.case).toEqual(authoringCase(byId(authoringFixture.cases) as unknown as Record<string, unknown>));
        if (golden.role === "director") {
          const row = byId(directorFixture.rows) as unknown as { acceptable: string[]; input: Record<string, unknown> };
          const { storyTitle: _title, ...input } = entry.case.input;
          const { player: _player, ...labelled } = row.input;
          expect({ acceptable: entry.case.acceptable, input }).toEqual({ acceptable: row.acceptable, input: labelled });
        }
        queued.length = 0;
        entry.responses.forEach((text: string, index: number) => queued.push({ text, finish: entry.finishes[index] ?? "unknown" }));
        let tick = 0;
        const result = await runRoleCase(golden.role, entry.case, { profileId: "replay", now: () => (tick++ === 0 ? 0 : entry.latencyMs) });
        expect(queued).toHaveLength(0);
        expect(result.score).toEqual(entry.score);
        replayed.push(result);
      }
      const floorIds = golden.role === "director" ? directorFixture.rows.slice(0, 26).map((row: { id: string }) => row.id) : undefined;
      expect(summarizeRoleCalibration(golden.role, replayed, floorIds ? { floorIds } : {})).toEqual(golden.summary);
    });
  }
});

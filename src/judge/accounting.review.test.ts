import { askJudge } from "./client";
import { canonicalModel, JUDGE_MODEL_IDS, modelVerdict } from "./policy";
import { choice } from "./questions";
import { judgeReadiness, judgeReadinessConcerns, JUDGE_READINESS, RING_USE_TO_READINESS } from "./readiness";
import { runContinuityRescore } from "./curatorCalibration";
import { appendJudgeCall, createJudgeRuntime, defaultJudgeSettings, dropJudgeCallsAfter, judgeMeterView, JUDGE_USE_KEYS, sanitizeJudgeRuntime, sanitizeJudgeSettings, type JudgeRuntimeState, type JudgeSettings } from "./settings";
import type { JudgeCallRecord, JudgeResponse } from "./types";

const request = { state: { scene: "the hall" }, questions: { where: choice("Where is the party?", { hall: "in the hall", road: "on the road" }) } };
const answer: JudgeResponse = { model: "jev-1.13.0", answers: { where: { type: "choice", choice: "hall", confidence: 0.9, probabilities: { hall: 0.9, road: 0.1 } } }, usage: { input_tokens: 296, output_tokens: 20 } };

const call = (overrides: Partial<JudgeCallRecord> = {}): JudgeCallRecord => ({ at: "2026-09-24T00:00:00.000Z", boundary: 1, messageId: 4, use: "warden", model: "jev-1.13.0", latencyMs: 700, stateChars: 900, questionCount: 3, ...overrides });

const settings = (patch: Partial<JudgeSettings> = {}, uses: Partial<JudgeSettings["uses"]> = {}): JudgeSettings => ({ ...defaultJudgeSettings(), enabled: true, ...patch, uses: { ...defaultJudgeSettings().uses, ...uses } });

describe("T25 model-id map (v2.4 plan 07)", () => {
  it.each([
    ["jev-1.13.0", "jev-1.13.0", "matched", undefined],
    ["jev-latest", "jev-1.13.0", "resolved", "jev-1.13.0"],
    ["jev-preview", "jev-1.13.0", "resolved", "jev-1.13.0"],
    ["jev-1.13.0", "jev-1.14.0", "mismatch", undefined],
    ["jev-latest", "jev-latest", "unknown", undefined],
    ["jev-1.13.0", null, "unknown", undefined],
    ["jev-1.14.0", "jev-1.14.0", "matched", undefined],
  ])("asked %s, answered %s: %s", (requested, answered, verdict, resolvedTo) => {
    expect(modelVerdict(requested, answered)).toEqual(resolvedTo ? { verdict, resolvedTo } : { verdict });
  });

  it("maps a floating alias to no version and a pinned id to its canonical form", () => {
    expect(JUDGE_MODEL_IDS.floating).toEqual(["jev-latest", "jev-preview"]);
    expect(canonicalModel("jev-latest")).toBeNull();
    expect(canonicalModel(" jev-1.13.0 ")).toBe("jev-1.13.0");
    expect(canonicalModel("")).toBeNull();
  });
});

describe("T24 usage copy (v2.4 plan 07)", () => {
  it("copies the usage the response carried, and a cache hit carries none and says cached", async () => {
    const cache = new Map<string, JudgeResponse>();
    const fresh = await askJudge(async () => answer, request, { timeoutMs: 1000, cache });
    expect(fresh).toMatchObject({ cached: false, usage: { input_tokens: 296, output_tokens: 20 } });
    const hit = await askJudge(async () => answer, request, { timeoutMs: 1000, cache });
    expect(hit.cached).toBe(true);
    expect(hit.usage).toBeUndefined();
  });

  it("keeps a host-sent cost and drops fields that are not numbers", async () => {
    const result = await askJudge(async () => ({ ...answer, usage: { input_tokens: 10, output_tokens: "x" as never, cost: 0.0004 } }), request, { timeoutMs: 1000 });
    expect(result.usage).toEqual({ input_tokens: 10, cost: 0.0004 });
  });

  it("control: a response without usage records none", async () => {
    const result = await askJudge(async () => ({ model: answer.model, answers: answer.answers }), request, { timeoutMs: 1000 });
    expect(result.usage).toBeUndefined();
  });
});

describe("T24 meter (v2.4 plan 07, X23)", () => {
  it("adds a sent call's tokens, counts a cache hit apart, and charges nothing for a call that never left", () => {
    let state = createJudgeRuntime();
    state = appendJudgeCall(state, call({ inputTokens: 296, outputTokens: 20 }));
    state = appendJudgeCall(state, call({ cached: true, latencyMs: 0 }));
    state = appendJudgeCall(state, call({ model: null, latencyMs: 0, fallback: "unavailable" }));
    state = appendJudgeCall(state, call({ model: null, fallback: "invalid" }));
    state = appendJudgeCall(state, call({ model: null, fallback: "timeout" }));
    state = appendJudgeCall(state, call({ inputTokens: 4, cost: 0.25 }));
    expect(state.meter).toEqual({ calls: 3, cachedCalls: 1, inputTokens: 300, outputTokens: 20, cost: 0.25 });
    expect(state.calls).toHaveLength(6);
  });

  it("meters a discarded call without putting it in the ring", () => {
    const state = appendJudgeCall(createJudgeRuntime(), call({ inputTokens: 50, discarded: "window" }));
    expect(state.calls).toEqual([]);
    expect(state.meter).toMatchObject({ calls: 1, inputTokens: 50 });
  });

  it("is untouched while a rollback cuts the ring, for every cut (property, 4 seeds x 60 cuts)", () => {
    for (const seed of [1, 7, 42, 2026]) {
      let rng = seed;
      const next = () => { rng = (rng * 1103515245 + 12345) % 2147483648; return rng / 2147483648; };
      let state: JudgeRuntimeState = createJudgeRuntime();
      for (let index = 0; index < 40; index += 1) {
        state = appendJudgeCall(state, call({ messageId: Math.floor(next() * 30), inputTokens: Math.floor(next() * 500), outputTokens: Math.floor(next() * 40), cached: next() < 0.2 }));
      }
      for (let cut = 0; cut < 60; cut += 1) {
        const messageId = Math.floor(next() * 32);
        const after = dropJudgeCallsAfter(state, messageId);
        expect(after.meter).toEqual(state.meter);
        expect(after.calls.every((entry) => entry.messageId < messageId)).toBe(true);
        expect(after.calls).toHaveLength(state.calls.filter((entry) => entry.messageId < messageId).length);
      }
    }
  });

  it("reads an absent or damaged meter as zeros and keeps a sound one (no blob bump)", () => {
    const zeros = { calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    expect(sanitizeJudgeRuntime({ calls: [], scene: null }).meter).toEqual(zeros);
    expect(sanitizeJudgeRuntime({ calls: [], scene: null, meter: { calls: -1, cachedCalls: "2", inputTokens: Number.NaN, outputTokens: 3, cost: 0.1 } }).meter).toEqual({ ...zeros, outputTokens: 3, cost: 0.1 });
    expect(sanitizeJudgeRuntime({ calls: [], scene: null, meter: { calls: 2, cachedCalls: 1, inputTokens: 10, outputTokens: 2, cost: 0 } }).meter).toEqual({ calls: 2, cachedCalls: 1, inputTokens: 10, outputTokens: 2, cost: 0 });
  });
});

describe("T24 readiness by model (v2.4 plan 07)", () => {
  it("names the model every measured row was measured on, and adds the warden's row", () => {
    for (const fact of Object.values(JUDGE_READINESS)) expect(fact.measuredOn).toBe(fact.calibration === null ? null : "jev-1.13.0");
    expect(JUDGE_READINESS.warden).toMatchObject({ calibration: 0.9765, latencyP50Ms: 720, live: "J8.5, J8.6", measuredOn: "jev-1.13.0" });
  });

  it("maps every use string the call ring records to readiness rows", () => {
    expect(RING_USE_TO_READINESS).toEqual({
      director: ["director"],
      memoryVerify: ["memoryVerify"],
      memoryPairs: ["memoryPairs"],
      curatorFilter: ["curatorFilter"],
      lore: ["loreSelect"],
      scene: ["sceneTrigger", "sceneTracker", "lookahead"],
      typed: ["typedExtraction"],
      stall: ["stallCheck"],
      critic: ["expansionCritic"],
      warden: ["warden"],
    });
    Object.values(RING_USE_TO_READINESS).flat().forEach((key) => expect(JUDGE_READINESS[key]).toBeDefined());
  });

  it("stays measured on the default install before any answer", () => {
    const rows = judgeReadiness(settings({}, { stallCheck: true }));
    expect(rows.find((row) => row.key === "stallCheck")).toMatchObject({ verdict: "measured" });
    expect(rows.find((row) => row.key === "stallCheck")?.modelMismatch).toBeUndefined();
  });

  it("reads unproven, never re-floored, when the configured model is not the one measured", () => {
    const rows = judgeReadiness(settings({ model: "jev-1.14.0" }, { stallCheck: true }));
    expect(rows.find((row) => row.key === "stallCheck")).toMatchObject({ verdict: "unproven", calibration: 1, modelMismatch: { configured: "jev-1.14.0", answered: null, measuredOn: "jev-1.13.0" } });
    expect(judgeReadinessConcerns(rows).map((row) => row.key)).toEqual(["stallCheck"]);
  });

  it("reads unproven when the model that answered is not the one measured, whatever was asked", () => {
    const rows = judgeReadiness(settings({}, { memoryVerify: true }), {}, "jev-1.14.0");
    expect(rows.find((row) => row.key === "memoryVerify")).toMatchObject({ verdict: "unproven", modelMismatch: { configured: "jev-1.13.0", answered: "jev-1.14.0", measuredOn: "jev-1.13.0" } });
  });

  it("a floating alias counts as measured once it answered with the measured version, and unproven before", () => {
    expect(judgeReadiness(settings({ model: "jev-latest" }, { memoryVerify: true }), {}, "jev-1.13.0").find((row) => row.key === "memoryVerify")?.verdict).toBe("measured");
    expect(judgeReadiness(settings({ model: "jev-latest" }, { memoryVerify: true })).find((row) => row.key === "memoryVerify")).toMatchObject({ verdict: "unproven", modelMismatch: { configured: "jev-latest", answered: null } });
  });

  it("lists the warden only when its own switch is on, under the judge's master switch", () => {
    expect(judgeReadiness(settings()).some((row) => row.key === "warden")).toBe(false);
    expect(judgeReadiness(settings(), {}, null, { warden: true }).find((row) => row.key === "warden")).toMatchObject({ enabled: true, verdict: "measured", calibration: 0.9765 });
    expect(judgeReadiness(settings({ enabled: false }), {}, null, { warden: true }).find((row) => row.key === "warden")?.verdict).toBe("off");
    expect(judgeReadiness(settings({ model: "jev-1.14.0" }), {}, null, { warden: true }).find((row) => row.key === "warden")?.verdict).toBe("unproven");
  });
});

describe("judge-off control column rescore (v2.4 plan 07, X12)", () => {
  it("scores each arm's replies with the calibrated continuity question; a silent judge counts neither way", async () => {
    const asked: string[] = [];
    const ask = async (req: { state: Record<string, unknown> }) => {
      const reply = (req.state.reply as { text: string }).text;
      asked.push(reply);
      if (reply === "silent") return { answers: null, model: null, latencyMs: 0, stateChars: 1, questionCount: 1, fallback: "timeout" as const, cached: false };
      return { answers: { "fact:0": { type: "noul" as const, noul: reply === "broken" ? 0.93 : 0.1 } }, model: "jev-1.13.0", latencyMs: 400, stateChars: 1, questionCount: 1, cached: false };
    };
    const rows = [
      { id: "m1", arm: "on", established: ["The gate is shut."], reply: { speaker: "Mara", text: "broken" } },
      { id: "m2", arm: "off", established: ["The gate is shut."], reply: { speaker: "Mara", text: "kept" } },
      { id: "m3", arm: "off", established: ["The gate is shut."], reply: { speaker: "Mara", text: "silent" } },
      { id: "m4", arm: "on", established: [], reply: { speaker: "Mara", text: "no facts" } },
    ];
    const results = await runContinuityRescore(ask as never, rows);
    expect(asked).toEqual(["broken", "kept", "silent"]);
    expect(results.map((row) => [row.id, row.arm, row.flagged])).toEqual([["m1", "on", true], ["m2", "off", false], ["m3", "off", null]]);
    expect(results[0].broken).toEqual(["The gate is shut."]);
    expect(results[2].fallback).toBe("timeout");
  });

  it("the meter view names the model that last answered, skipping rows with none", () => {
    let state = createJudgeRuntime();
    state = appendJudgeCall(state, call({ model: "jev-1.13.0", inputTokens: 5 }));
    state = appendJudgeCall(state, call({ model: null, fallback: "timeout" }));
    expect(judgeMeterView(state)).toEqual({ calls: 2, cachedCalls: 0, inputTokens: 5, outputTokens: 0, cost: 0, lastAnsweredModel: "jev-1.13.0" });
    expect(judgeMeterView(createJudgeRuntime()).lastAnsweredModel).toBeNull();
  });
});

describe("dead toggles removed (v2.4 plan 07, X22)", () => {
  it("no longer declares sceneOoc or memoryRerank, and a stored true is dropped on read", () => {
    expect(JUDGE_USE_KEYS).not.toContain("sceneOoc");
    expect(JUDGE_USE_KEYS).not.toContain("memoryRerank");
    const read = sanitizeJudgeSettings({ enabled: true, uses: { sceneOoc: true, memoryRerank: true, stallCheck: true } });
    expect(Object.keys(read.uses)).not.toContain("sceneOoc");
    expect(Object.keys(read.uses)).not.toContain("memoryRerank");
    expect(read.uses.stallCheck).toBe(true);
    expect(Object.keys(JUDGE_READINESS)).not.toContain("sceneOoc");
  });
});

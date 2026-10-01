import {
  defaultJudgeSettings, judgeReadiness, judgeReadinessConcerns, judgeRoute, sanitizeJudgeSettings, JUDGE_READINESS_BY_PROVIDER, JUDGE_ROUTE_KEYS, RING_USE_ROUTE_KEYS,
  type JudgeCallRecord, type JudgeDirectorInput, type JudgeProviderId, type JudgeResponse, type JudgeSettings, type JudgeTransport,
} from "@judge/index";
import { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

const routed = (routes: Partial<Record<(typeof JUDGE_ROUTE_KEYS)[number], JudgeProviderId>>): JudgeSettings => {
  const base = defaultJudgeSettings();
  return { ...base, provider: { ...base.provider, ...routes } };
};

const input: JudgeDirectorInput = {
  checkpointName: "Gate",
  objective: "Open it",
  player: "Max",
  candidates: [{ rosterId: "guard", name: "Mara", role: "gate captain" }, { rosterId: "sage", name: "Finn", role: "old scholar" }],
  allowSilence: false,
  window: [{ speaker: "Max", text: "Mara, open the gate." }],
};

const answered: JudgeResponse = {
  model: "llama-server:artemis",
  answers: { who: { type: "choice", choice: "Mara", confidence: 0.9, probabilities: { Mara: 0.9, Finn: 0.1 } }, nobody: { type: "noul", noul: 0.05 } },
};

const setup = (settings: JudgeSettings) => {
  const records: JudgeCallRecord[] = [];
  const typesafe = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async () => answered);
  const llama = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async () => answered);
  const runtime = new JudgeRuntime({
    ownership: testOwnership(),
    getSettings: () => settings,
    transport: typesafe,
    providers: { "llama-logprob": llama },
    status: async () => ({ configured: true, providers: { typesafe: { configured: true }, "llama-logprob": { configured: true } } }),
    record: (record) => records.push(record),
    context: () => ({ boundary: 2, messageId: 5 }),
    now: () => 1_000,
  });
  return { runtime, records, typesafe, llama };
};

describe("decision-provider routing (v2.6 plan 12 A)", () => {
  it("guards no-behaviour-change: with default settings every ring use routes to typesafe and nothing is refused", () => {
    const settings = defaultJudgeSettings();
    for (const use of [...Object.keys(RING_USE_ROUTE_KEYS), "probe", "unknown"]) expect(judgeRoute(settings, use)).toMatchObject({ provider: "typesafe" });
    expect(Object.keys(RING_USE_ROUTE_KEYS).some((use) => judgeRoute(settings, use).refused)).toBe(false);
  });

  it("guards the calibration rule: a use routed to a provider nobody calibrated it on is refused, sends nothing and keeps its fallback", async () => {
    const { runtime, records, typesafe, llama } = setup(routed({ director: "llama-logprob" }));
    const decision = await runtime.director(input);
    expect(decision).toBeNull();
    expect(typesafe).not.toHaveBeenCalled();
    expect(llama).not.toHaveBeenCalled();
    expect(records).toEqual([expect.objectContaining({ use: "director", fallback: "uncalibrated", provider: "llama-logprob", model: null })]);
  });

  it("control: once a calibration row exists for provider x use, the call goes to that provider and the record names it", async () => {
    const table = JUDGE_READINESS_BY_PROVIDER["llama-logprob"];
    table.director = { calibration: 0.95, latencyP50Ms: 300, live: null, measuredOn: "artemis", recommendation: "test row" };
    try {
      const { runtime, records, typesafe, llama } = setup(routed({ director: "llama-logprob" }));
      await runtime.director(input);
      expect(llama).toHaveBeenCalledTimes(1);
      expect(typesafe).not.toHaveBeenCalled();
      expect(llama.mock.calls[0][0].model).toBeUndefined();
      expect(records).toEqual([expect.objectContaining({ use: "director", provider: "llama-logprob", model: "llama-server:artemis" })]);
    } finally {
      delete table.director;
    }
  });

  it("a provider the server has not configured is unavailable, never silently sent to typesafe instead", async () => {
    const table = JUDGE_READINESS_BY_PROVIDER["llama-logprob"];
    table.memoryPairs = { calibration: 0.9, latencyP50Ms: 300, live: null, measuredOn: "artemis", recommendation: "test row" };
    try {
      const records: JudgeCallRecord[] = [];
      const typesafe = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async () => answered);
      const runtime = new JudgeRuntime({
        ownership: testOwnership(),
        getSettings: () => routed({ memoryPairs: "llama-logprob" }),
        transport: typesafe,
        providers: {},
        status: async () => ({ configured: true }),
        record: (record) => records.push(record),
        context: () => ({ boundary: 1, messageId: 1 }),
      });
      const result = await runtime.ask("memoryPairs", { state: { a: 1 }, questions: { q: { type: "noul", instructions: "q?" } } });
      expect(result.fallback).toBe("unavailable");
      expect(typesafe).not.toHaveBeenCalled();
      expect(records[0]).toMatchObject({ fallback: "unavailable", provider: "llama-logprob" });
    } finally {
      delete table.memoryPairs;
    }
  });

  it("one call serving several uses runs only when all of them name the same provider; a split is refused", async () => {
    const settings = routed({ sceneTracker: "llama-logprob" });
    expect(judgeRoute(settings, "scene")).toMatchObject({ refused: "split" });
    const { runtime, typesafe, llama, records } = setup(settings);
    const result = await runtime.ask("scene", { state: {}, questions: { q: { type: "noul", instructions: "q?" } } });
    expect(result.fallback).toBe("uncalibrated");
    expect(typesafe).not.toHaveBeenCalled();
    expect(llama).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(judgeRoute(routed({ sceneTracker: "llama-logprob" }), "scene").keys).toEqual(["sceneTrigger", "sceneTracker", "lookahead"]);
    expect(judgeRoute({ ...routed({ houseRules: "llama-logprob" }), uses: { ...defaultJudgeSettings().uses, houseRules: false } }, "warden").refused).toBeUndefined();
  });

  it("readiness is keyed provider x model x use: an uncalibrated provider reads unproven and says which provider", () => {
    const rows = judgeReadiness(routed({ stallCheck: "llama-logprob" }));
    const stall = rows.find((row) => row.key === "stallCheck");
    expect(stall).toMatchObject({ verdict: "unproven", provider: "llama-logprob", uncalibratedOn: "llama-logprob", calibration: null });
    expect(judgeReadinessConcerns(rows).map((row) => row.key)).toContain("stallCheck");
    expect(judgeReadiness(defaultJudgeSettings()).find((row) => row.key === "stallCheck")).toMatchObject({ verdict: "measured", provider: "typesafe" });
    expect(judgeReadiness(routed({ sceneTracker: "llama-logprob" })).find((row) => row.key === "sceneTrigger")).toMatchObject({ verdict: "unproven", splitFrom: ["sceneTracker"] });
  });

  it("sanitize keeps known providers, maps anything else to typesafe, and keeps only known acknowledged notices", () => {
    const clean = sanitizeJudgeSettings({ provider: { director: "llama-logprob", memoryVerify: "openai", warden: 3 }, noticesSeen: ["typesafe", "nope", "typesafe"] });
    expect(clean.provider.director).toBe("llama-logprob");
    expect(clean.provider.memoryVerify).toBe("typesafe");
    expect(clean.provider.warden).toBe("typesafe");
    expect(Object.keys(clean.provider).sort()).toEqual([...JUDGE_ROUTE_KEYS].sort());
    expect(clean.noticesSeen).toEqual(["typesafe"]);
    expect(sanitizeJudgeSettings({}).provider).toEqual(defaultJudgeSettings().provider);
  });
});

describe("CR-J22: a probe never falls back to TypeSafe", () => {
  it("refuses a provider this page has no transport for, and sends nothing", async () => {
    const records: JudgeCallRecord[] = [];
    const typesafe = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async () => answered);
    const runtime = new JudgeRuntime({
      ownership: testOwnership(),
      getSettings: () => defaultJudgeSettings(),
      transport: typesafe,
      status: async () => ({ configured: true }),
      record: (record) => records.push(record),
      context: () => ({ boundary: 1, messageId: 1 }),
    });
    const probe = { state: { scene: "x" }, questions: { here: { type: "noul" as const, instructions: "Is `scene` set?" } } };
    await expect(runtime.probe(probe, "jev-1.13.0", "llama-logprob")).resolves.toMatchObject({ answers: null, fallback: "unavailable" });
    expect(typesafe).not.toHaveBeenCalled();
    await expect(runtime.probe(probe)).resolves.toMatchObject({ answers: answered.answers });
    expect(typesafe).toHaveBeenCalledTimes(1);
    expect(records).toEqual([]);
  });
});

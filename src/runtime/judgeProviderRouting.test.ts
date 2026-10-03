import {
  defaultJudgeSettings, judgeReadiness, judgeReadinessConcerns, judgeRoute, providerCleared, sanitizeJudgeSettings, JUDGE_FIXTURE_REVISION, JUDGE_READINESS_BY_PROVIDER, JUDGE_ROUTE_KEYS, RING_USE_ROUTE_KEYS,
  LLAMA_LOGPROB_MEASURED_ON, type JudgeCallRecord, type JudgeDirectorInput, type JudgeReadinessFact, type JudgeReadinessKey, type JudgeProviderId, type JudgeResponse, type JudgeSettings, type JudgeTransport,
} from "@judge/index";
import { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

const REMEASURED = { fixtureRevisions: Object.fromEntries(Object.entries(JUDGE_READINESS_BY_PROVIDER.typesafe).flatMap(([key, fact]) => (fact?.fixtureRevision ? [[key, fact.fixtureRevision]] : []))) };
const remeasured: typeof judgeReadiness = (settings, dependencies = {}, answered = null, extra = {}) => judgeReadiness(settings, dependencies, answered, { ...extra, ...REMEASURED });

const putRow = (key: JudgeReadinessKey, fact: JudgeReadinessFact) => {
  const table = JUDGE_READINESS_BY_PROVIDER["llama-logprob"];
  const saved = table[key];
  table[key] = fact;
  return () => {
    if (saved) table[key] = saved;
    else delete table[key];
  };
};

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
    const restore = putRow("director", { calibration: 0.95, latencyP50Ms: 300, live: null, measuredOn: "artemis", recommendation: "test row", fixtureRevision: JUDGE_FIXTURE_REVISION.director, passed: true });
    try {
      const { runtime, records, typesafe, llama } = setup(routed({ director: "llama-logprob" }));
      await runtime.director(input);
      expect(llama).toHaveBeenCalledTimes(1);
      expect(typesafe).not.toHaveBeenCalled();
      expect(llama.mock.calls[0][0].model).toBeUndefined();
      expect(records).toEqual([expect.objectContaining({ use: "director", provider: "llama-logprob", model: "llama-server:artemis" })]);
    } finally {
      restore();
    }
  });

  it("a provider the server has not configured is unavailable, never silently sent to typesafe instead", async () => {
    const restore = putRow("memoryPairs", { calibration: 0.9, latencyP50Ms: 300, live: null, measuredOn: "artemis", recommendation: "test row", fixtureRevision: JUDGE_FIXTURE_REVISION.memoryPairs, passed: true });
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
      restore();
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
    const rows = judgeReadiness(routed({ curatorFilter: "llama-logprob" }));
    const curator = rows.find((row) => row.key === "curatorFilter");
    expect(curator).toMatchObject({ verdict: "unproven", provider: "llama-logprob", uncalibratedOn: "llama-logprob", calibration: null });
    expect(judgeReadinessConcerns(rows).map((row) => row.key)).toContain("curatorFilter");
    expect(remeasured(defaultJudgeSettings()).find((row) => row.key === "stallCheck")).toMatchObject({ verdict: "measured", provider: "typesafe" });
    expect(remeasured(routed({ sceneTracker: "llama-logprob" })).find((row) => row.key === "sceneTrigger")).toMatchObject({ verdict: "unproven", splitFrom: ["sceneTracker"] });
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

describe("AS-4: readiness and routing are keyed provider x model x use x fixture revision", () => {
  const fact = (patch: Record<string, unknown> = {}) => ({
    calibration: 0.95, latencyP50Ms: 300, live: null, measuredOn: "artemis", recommendation: "test row", fixtureRevision: JUDGE_FIXTURE_REVISION.director, passed: true, ...patch,
  });
  const withRow = async (patch: Record<string, unknown>, body: () => Promise<void> | void) => {
    const restore = putRow("director", fact(patch));
    try {
      await body();
    } finally {
      restore();
    }
  };

  it("refuses a stale calibration (another fixture revision) and sends nothing", () => withRow({ fixtureRevision: "older-fixtures" }, async () => {
    expect(judgeRoute(routed({ director: "llama-logprob" }), "director")).toMatchObject({ refused: "uncalibrated" });
    const { runtime, llama, records } = setup(routed({ director: "llama-logprob" }));
    await runtime.director(input);
    expect(llama).not.toHaveBeenCalled();
    expect(records[0]).toMatchObject({ fallback: "uncalibrated", provider: "llama-logprob" });
    expect(judgeReadiness(routed({ director: "llama-logprob" })).find((row) => row.key === "director")).toMatchObject({ verdict: "unproven", calibrationProblem: "stale" });
  }));

  it("refuses a failed calibration (below its floor) and sends nothing", () => withRow({ passed: false }, async () => {
    expect(judgeRoute(routed({ director: "llama-logprob" }), "director")).toMatchObject({ refused: "uncalibrated" });
    const { runtime, llama } = setup(routed({ director: "llama-logprob" }));
    await runtime.director(input);
    expect(llama).not.toHaveBeenCalled();
    expect(judgeReadiness(routed({ director: "llama-logprob" })).find((row) => row.key === "director")).toMatchObject({ verdict: "unproven", calibrationProblem: "failed" });
  }));

  it("a non-default provider serving another model than the calibrated one: the answer is discarded and the next call is refused before sending", () => withRow({}, async () => {
    const { runtime, llama, records } = setup(routed({ director: "llama-logprob" }));
    llama.mockImplementation(async () => ({ ...answered, model: "llama-server:qwen" }));
    await expect(runtime.director(input)).resolves.toBeNull();
    expect(records[0]).toMatchObject({ fallback: "model-mismatch", provider: "llama-logprob", model: "llama-server:qwen" });
    await runtime.director(input);
    expect(llama).toHaveBeenCalledTimes(1);
    expect(judgeRoute(routed({ director: "llama-logprob" }), "director", { "llama-logprob": "llama-server:qwen" })).toMatchObject({ refused: "uncalibrated" });
    expect(judgeRoute(routed({ director: "llama-logprob" }), "director", { "llama-logprob": "llama-server:artemis" }).refused).toBeUndefined();
  }));

  it("readiness checks the model on a non-default provider: unknown or another model is unproven, the calibrated one is measured", () => withRow({}, () => {
    const settings = routed({ director: "llama-logprob" });
    const director = (served?: string) => judgeReadiness(settings, {}, null, served ? { served: { "llama-logprob": served } } : {}).find((row) => row.key === "director");
    expect(director()).toMatchObject({ verdict: "unproven", modelMismatch: { answered: null, measuredOn: "artemis" } });
    expect(director("llama-server:qwen")).toMatchObject({ verdict: "unproven", modelMismatch: { answered: "llama-server:qwen" } });
    expect(director("llama-server:artemis")).toMatchObject({ verdict: "measured" });
  }));

  it("a stale typesafe row reads unproven but keeps routing (the default provider never refuses)", () => {
    const row = JUDGE_READINESS_BY_PROVIDER.typesafe.stallCheck;
    const saved = { ...row! };
    Object.assign(row!, { fixtureRevision: "older-fixtures" });
    try {
      expect(judgeReadiness(routed({}), {}, null).find((entry) => entry.key === "stallCheck")).toMatchObject({ verdict: "unproven", fixtureStale: { measured: "older-fixtures" } });
      expect(judgeRoute(routed({}), "stall").refused).toBeUndefined();
    } finally {
      Object.assign(row!, saved);
    }
  });
});

describe("plan 12 Phase B: the recorded llama-logprob rows (2026-10-03)", () => {
  const SERVED = { "llama-logprob": `llama-server:${LLAMA_LOGPROB_MEASURED_ON}` };
  const table = JUDGE_READINESS_BY_PROVIDER["llama-logprob"];

  it("records every measured use as failed after the T6-2 play check, nothing for the unmeasured", () => {
    const passed = Object.entries(table).filter(([, fact]) => fact?.passed === true).map(([key]) => key).sort();
    const failed = Object.entries(table).filter(([, fact]) => fact?.passed === false).map(([key]) => key).sort();
    expect(passed).toEqual([]);
    expect(failed).toEqual(["agencyCheck", "director", "expansionCritic", "expansionLookahead", "lookahead", "memoryPairs", "memoryVerify", "stallCheck", "typedExtraction", "warden", "wardenLore"]);
    expect(Object.keys(table)).toHaveLength(passed.length + failed.length);
    for (const [key, fact] of Object.entries(table)) {
      expect([key, fact?.fixtureRevision]).toEqual([key, JUDGE_FIXTURE_REVISION[key as JudgeReadinessKey]]);
      expect(fact?.measuredOn).toBe(LLAMA_LOGPROB_MEASURED_ON);
    }
  });

  const passing = (keys: JudgeReadinessKey[]) => {
    const saved = keys.map((key) => [key, { ...table[key]! }] as const);
    for (const key of keys) Object.assign(table[key]!, { passed: true });
    return () => saved.forEach(([key, fact]) => Object.assign(table[key]!, fact));
  };

  it("a passed row routes when the served model is the measured one, and a call goes to llama-logprob", async () => {
    const restore = passing(["memoryPairs", "warden", "agencyCheck"]);
    try {
    expect(providerCleared("llama-logprob", "memoryPairs", SERVED)).toBe(true);
    expect(judgeRoute(routed({ memoryPairs: "llama-logprob" }), "memoryPairs", SERVED)).toEqual({ provider: "llama-logprob", keys: ["memoryPairs"] });
    expect(judgeRoute(routed({ warden: "llama-logprob", agencyCheck: "llama-logprob" }), "warden", SERVED)).toEqual({ provider: "llama-logprob", keys: ["warden", "agencyCheck"] });
    const { runtime, llama, typesafe, records } = setup(routed({ memoryPairs: "llama-logprob" }));
    llama.mockImplementation(async () => ({ model: SERVED["llama-logprob"], answers: { q: { type: "noul", noul: 0.9 } } }));
    const result = await runtime.ask("memoryPairs", { state: { a: 1 }, questions: { q: { type: "noul", instructions: "q?" } } });
    expect(result.fallback).toBeUndefined();
    expect(llama).toHaveBeenCalledTimes(1);
    expect(typesafe).not.toHaveBeenCalled();
    expect(records[0]).toMatchObject({ use: "memoryPairs", provider: "llama-logprob", model: SERVED["llama-logprob"] });
    } finally {
      restore();
    }
  });

  it("a passed row serving another model is refused", () => {
    const restore = passing(["memoryPairs"]);
    try {
      expect(providerCleared("llama-logprob", "memoryPairs", { "llama-logprob": "llama-server:/workspace/models/other.gguf" })).toBe(false);
      expect(judgeRoute(routed({ memoryPairs: "llama-logprob" }), "memoryPairs", { "llama-logprob": "llama-server:/workspace/models/other.gguf" })).toMatchObject({ refused: "uncalibrated" });
    } finally {
      restore();
    }
  });

  it("a failed row is refused even on the measured model, and the panel row says it was measured and failed", () => {
    expect(providerCleared("llama-logprob", "director", SERVED)).toBe(false);
    expect(judgeRoute(routed({ director: "llama-logprob" }), "director", SERVED)).toMatchObject({ refused: "uncalibrated" });
    expect(judgeReadiness(routed({ director: "llama-logprob" }), {}, null, { served: SERVED }).find((row) => row.key === "director"))
      .toMatchObject({ verdict: "unproven", calibrationProblem: "failed", calibration: 0.88 });
  });

  it("house rules has no row: the warden's call is refused split when house rules stays on typesafe, uncalibrated when it follows", () => {
    const restore = passing(["warden", "agencyCheck"]);
    try {
      const on = (routes: Parameters<typeof routed>[0]) => ({ ...routed(routes), uses: { ...defaultJudgeSettings().uses, houseRules: true } });
      expect(judgeRoute(on({ warden: "llama-logprob", agencyCheck: "llama-logprob" }), "warden", SERVED)).toMatchObject({ refused: "split" });
      expect(judgeRoute(on({ warden: "llama-logprob", agencyCheck: "llama-logprob", houseRules: "llama-logprob" }), "warden", SERVED)).toMatchObject({ refused: "uncalibrated" });
    } finally {
      restore();
    }
  });

  it("after the T6-2 play check no use routes to llama-logprob on the measured model", () => {
    for (const key of ["memoryPairs", "typedExtraction", "stallCheck", "warden", "agencyCheck"] as JudgeReadinessKey[]) expect(providerCleared("llama-logprob", key, SERVED)).toBe(false);
  });

  it("the default provider stays typesafe for every use", () => {
    expect(new Set(Object.values(defaultJudgeSettings().provider))).toEqual(new Set(["typesafe"]));
  });
});

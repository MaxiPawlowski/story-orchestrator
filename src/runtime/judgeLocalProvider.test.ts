import {
  defaultJudgeSettings, JUDGE_FIXTURE_REVISION, JUDGE_PROVIDERS, JUDGE_PROVIDER_IDS, JUDGE_READINESS_BY_PROVIDER, JUDGE_ROUTE_KEYS, judgeRoute, providerLeavesMachine, RING_USE_ROUTE_KEYS, sanitizeJudgeSettings,
  type JudgeCallRecord, type JudgeDirectorInput, type JudgeProviderId, type JudgeResponse, type JudgeSettings, type JudgeTransport,
} from "@judge/index";
import { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

const LOCAL: JudgeProviderId = "systemone-local";
const MODEL = "decider-4b-v2.1-Q4_K_M";

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

const answered = (model = MODEL): JudgeResponse => ({
  model,
  answers: { who: { type: "choice", choice: "Mara", confidence: 0.9, probabilities: { Mara: 0.9, Finn: 0.1 } }, nobody: { type: "noul", noul: 0.05 } },
});

const setup = (settings: JudgeSettings, model = MODEL) => {
  const records: JudgeCallRecord[] = [];
  const typesafe = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async () => answered("jev-1.13.0"));
  const local = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(async () => answered(model));
  const runtime = new JudgeRuntime({
    ownership: testOwnership(),
    getSettings: () => settings,
    transport: typesafe,
    providers: { [LOCAL]: local },
    status: async () => ({ configured: true, providers: { typesafe: { configured: true }, [LOCAL]: { configured: true } } }),
    record: (record) => records.push(record),
    context: () => ({ boundary: 2, messageId: 5 }),
    now: () => 1_000,
  });
  return { runtime, records, typesafe, local };
};

const withRow = async (run: () => Promise<void>) => {
  const table = JUDGE_READINESS_BY_PROVIDER[LOCAL];
  table.director = { calibration: 0.92, latencyP50Ms: 400, live: null, measuredOn: MODEL, recommendation: "test row", fixtureRevision: JUDGE_FIXTURE_REVISION.director, passed: true };
  try {
    await run();
  } finally {
    delete table.director;
  }
};

describe("local judge provider (v2.8 plan 14, A1)", () => {
  it("is a selectable provider that never leaves the machine, with no calibration rows yet", () => {
    expect(JUDGE_PROVIDER_IDS).toContain(LOCAL);
    expect(JUDGE_PROVIDERS[LOCAL].remote).toBe(false);
    expect(providerLeavesMachine(LOCAL, { configured: true, local: true, host: "127.0.0.1:8095" })).toBe(false);
    expect(JUDGE_READINESS_BY_PROVIDER[LOCAL]).toEqual({});
    expect(sanitizeJudgeSettings({ provider: { director: LOCAL } }).provider.director).toBe(LOCAL);
  });

  it("keeps TypeSafe the default for every use", () => {
    const settings = defaultJudgeSettings();
    for (const key of JUDGE_ROUTE_KEYS) expect(settings.provider[key]).toBe("typesafe");
  });

  it("refuses every use routed to it until calibrated: nothing is sent to either provider", async () => {
    for (const use of Object.keys(RING_USE_ROUTE_KEYS)) {
      const routes = Object.fromEntries(RING_USE_ROUTE_KEYS[use].map((key) => [key, LOCAL]));
      expect([use, judgeRoute(routed(routes), use).refused]).toEqual([use, "uncalibrated"]);
    }
    const { runtime, records, typesafe, local } = setup(routed({ director: LOCAL }));
    expect(await runtime.director(input)).toBeNull();
    expect(typesafe).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
    expect(records).toEqual([expect.objectContaining({ use: "director", fallback: "uncalibrated", provider: LOCAL })]);
  });

  it("control: with a passed row on the current fixture revision the call goes to the local transport, never TypeSafe", async () => {
    await withRow(async () => {
      const { runtime, records, typesafe, local } = setup(routed({ director: LOCAL }));
      expect(await runtime.director(input)).not.toBeNull();
      expect(local).toHaveBeenCalledTimes(1);
      expect(local.mock.calls[0][0]).not.toHaveProperty("model");
      expect(typesafe).not.toHaveBeenCalled();
      expect(records).toEqual([expect.objectContaining({ use: "director", provider: LOCAL, model: MODEL })]);
    });
  });

  it("discards an answer from a model other than the calibrated one, and refuses the next call before sending", async () => {
    await withRow(async () => {
      const { runtime, records, local } = setup(routed({ director: LOCAL }), "plumb-4b");
      expect(await runtime.director(input)).toBeNull();
      expect(records[0]).toMatchObject({ fallback: "model-mismatch", provider: LOCAL, model: "plumb-4b" });
      expect(await runtime.director(input)).toBeNull();
      expect(local).toHaveBeenCalledTimes(1);
    });
  });
});

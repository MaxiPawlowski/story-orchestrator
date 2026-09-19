import { defaultJudgeSettings, type JudgeCallRecord, type JudgeDirectorInput, type JudgeResponse, type JudgeSettings, type JudgeTransport } from "@judge/index";
import { JudgeRuntime, JUDGE_STATUS_TTL_MS } from "./judge";

const settings = (patch: Partial<JudgeSettings> = {}, uses: Partial<JudgeSettings["uses"]> = {}): JudgeSettings => {
  const base = defaultJudgeSettings();
  return { ...base, enabled: true, ...patch, uses: { ...base.uses, director: true, ...uses } };
};

const input = (overrides: Partial<JudgeDirectorInput> = {}): JudgeDirectorInput => ({
  checkpointName: "Gate",
  objective: "Open it",
  player: "Max",
  candidates: [{ rosterId: "guard", name: "Mara", role: "gate captain" }, { rosterId: "sage", name: "Finn", role: "old scholar" }],
  allowSilence: false,
  window: [{ speaker: "Max", text: "Mara, open the gate." }],
  ...overrides,
});

const pickMara: JudgeResponse = {
  model: "jev-1.13.0",
  answers: {
    who: { type: "choice", choice: "Mara", confidence: 0.92, probabilities: { Mara: 0.92, Finn: 0.08 } },
    nobody: { type: "noul", noul: 0.02 },
    "addr:guard": { type: "noul", noul: 0.95 },
    "reason:guard": { type: "noul", noul: 0.9 },
    "addr:sage": { type: "noul", noul: 0.05 },
    "reason:sage": { type: "noul", noul: 0.2 },
  },
};

const setup = (options: { settings?: JudgeSettings; transport?: JudgeTransport; configured?: boolean | null; clock?: { now: number } } = {}) => {
  const records: JudgeCallRecord[] = [];
  const transport = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>(options.transport ?? (async () => pickMara));
  const status = jest.fn(async () => (options.configured === null ? null : { configured: options.configured ?? true }));
  const clock = options.clock ?? { now: 1_000_000 };
  const runtime = new JudgeRuntime({
    getSettings: () => options.settings ?? settings(),
    transport,
    status,
    record: (record) => records.push(record),
    context: () => ({ boundary: 7, messageId: 12 }),
    now: () => clock.now,
  });
  return { runtime, records, transport, status, clock };
};

describe("JudgeRuntime.director", () => {
  it("does nothing, and records nothing, unless both the master switch and the usage are on", async () => {
    for (const current of [settings({ enabled: false }), settings({}, { director: false })]) {
      const { runtime, records, transport, status } = setup({ settings: current });
      expect(await runtime.director(input())).toBeNull();
      expect(records).toEqual([]);
      expect(transport).not.toHaveBeenCalled();
      expect(status).not.toHaveBeenCalled();
    }
  });

  it("decides, and records the call with the model and the probabilities the policy used", async () => {
    const { runtime, records, transport } = setup();
    expect(await runtime.director(input())).toEqual({ kind: "member", rosterId: "guard", name: "Mara", confidence: 0.92, via: "choice" });
    expect(transport.mock.calls[0][0].model).toBe("jev-1.13.0");
    expect(transport.mock.calls[0][1].timeoutMs).toBe(1500);
    expect(records).toEqual([expect.objectContaining({ use: "director", model: "jev-1.13.0", boundary: 7, messageId: 12, questionCount: 6, p: { who: "Mara", whoConfidence: 0.92, via: "choice", picked: "Mara" } })]);
    expect(records[0].fallback).toBeUndefined();
  });

  it("records no-roles and never calls the judge for a pool without roles", async () => {
    const { runtime, records, transport } = setup();
    const noRoles = input({ candidates: [{ rosterId: "guard", name: "Mara" }, { rosterId: "sage", name: "Finn", role: "old scholar" }] });
    expect(await runtime.director(noRoles)).toBeNull();
    expect(records).toEqual([expect.objectContaining({ use: "director", fallback: "no-roles", model: null })]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("stays quiet for a single option: there is nothing to decide", async () => {
    const { runtime, records } = setup();
    expect(await runtime.director(input({ candidates: [input().candidates[0]] }))).toBeNull();
    expect(records).toEqual([]);
  });

  it("falls back when the plugin is missing or has no key, and caches that status for a while", async () => {
    const missing = setup({ configured: null });
    expect(await missing.runtime.director(input())).toBeNull();
    expect(missing.records[0]).toMatchObject({ fallback: "unavailable" });
    expect(missing.transport).not.toHaveBeenCalled();

    const clock = { now: 1_000_000 };
    const noKey = setup({ configured: false, clock });
    await noKey.runtime.director(input());
    await noKey.runtime.director(input({ window: [{ speaker: "Max", text: "again" }] }));
    expect(noKey.status).toHaveBeenCalledTimes(1);
    clock.now += JUDGE_STATUS_TTL_MS + 1;
    await noKey.runtime.director(input({ window: [{ speaker: "Max", text: "later" }] }));
    expect(noKey.status).toHaveBeenCalledTimes(2);
  });

  it("falls back on a transport error and re-probes the plugin next time", async () => {
    const { runtime, records, status } = setup({ transport: async () => { throw new Error("judge plugin 500"); } });
    expect(await runtime.director(input())).toBeNull();
    expect(records[0]).toMatchObject({ use: "director", fallback: "error" });
    await runtime.director(input({ window: [{ speaker: "Max", text: "again" }] }));
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("serves an identical request from the session cache", async () => {
    const { runtime, transport, records } = setup();
    await runtime.director(input());
    await runtime.director(input());
    expect(transport).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(2);
  });
});

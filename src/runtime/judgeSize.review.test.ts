import { createJudgeGate, createJudgeRuntime, defaultJudgeSettings, meterJudgeCall, noul, type JudgeCallRecord, type JudgeRequest, type JudgeResponse } from "@judge/index";
import { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

const runtimeWith = () => {
  const records: JudgeCallRecord[] = [];
  const sent: JudgeRequest[] = [];
  const transport = jest.fn(async (request: JudgeRequest): Promise<JudgeResponse> => {
    sent.push(request);
    return { model: "jev-1.13.0", answers: { q: { type: "noul", noul: 0.9 } } };
  });
  const status = jest.fn(async () => ({ configured: true, maxInFlight: 2 }));
  const settings = { ...defaultJudgeSettings(), enabled: true };
  const runtime = new JudgeRuntime({
    getSettings: () => settings, transport, status, record: (record) => records.push(record),
    context: () => ({ boundary: 3, messageId: 7 }), ownership: testOwnership(), gate: createJudgeGate({ retryMs: 1 }),
  });
  return { runtime, records, sent, status };
};

const oversized = (): JudgeRequest => ({ state: { transcript: "a ".repeat(55_000) }, questions: { q: noul("Does `transcript` contradict the facts?") } });

describe("a judge request past TypeSafe's documented size is never sent (2026-10-02)", () => {
  it("takes the too-large fallback, records it in the calls ring, meters nothing and leaves the status alone", async () => {
    const { runtime, records, sent, status } = runtimeWith();
    const result = await runtime.ask("memoryVerify", oversized());
    expect(result).toMatchObject({ answers: null, fallback: "too-large", cached: false });
    expect(sent).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ use: "memoryVerify", fallback: "too-large", boundary: 3, messageId: 7, questionCount: 1, stateChars: JSON.stringify(oversized().state).length });
    const meter = createJudgeRuntime().meter;
    expect(meterJudgeCall(meter, records[0])).toEqual(meter);
    const asked = status.mock.calls.length;
    await runtime.ask("memoryVerify", { state: { transcript: "short" }, questions: { q: noul("Is `transcript` short?") } });
    expect(status).toHaveBeenCalledTimes(asked);
    expect(sent).toHaveLength(1);
    expect(records[1].fallback).toBeUndefined();
  });
});

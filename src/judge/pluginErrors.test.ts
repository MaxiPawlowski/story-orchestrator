import { askJudge, JudgePluginError, meterJudgeCall, emptyJudgeMeter, type JudgeRequest, type JudgeTransport } from "./index";

const request: JudgeRequest = { state: { scene: "the hall" }, questions: { here: { type: "noul", instructions: "Is `scene` a hall?" } } };

const failing = (status: number): JudgeTransport => async () => { throw new JudgePluginError(status); };

describe("CR-J12: a judge plugin error is classified by its status", () => {
  it.each([[504, "timeout"], [409, "unavailable"], [401, "auth"], [500, "error"]] as const)("%s answers %s", async (status, fallback) => {
    await expect(askJudge(failing(status), request, { timeoutMs: 1000 })).resolves.toMatchObject({ answers: null, fallback });
  });

  it("an auth refusal is metered as never sent, like an unconfigured plugin", () => {
    const meter = emptyJudgeMeter();
    const record = { at: "x", boundary: 1, messageId: 1, use: "director", model: null, latencyMs: 0, stateChars: 1, questionCount: 1 };
    expect(meterJudgeCall(meter, { ...record, fallback: "auth" })).toBe(meter);
    expect(meterJudgeCall(meter, { ...record, fallback: "timeout" }).calls).toBe(1);
  });
});

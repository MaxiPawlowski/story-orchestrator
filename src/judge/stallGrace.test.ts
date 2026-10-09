import { askJudge, budgetTimer } from "./client";
import { CONTINUITY_TIMEOUT_MS, JUDGE_STALL_GRACE_MS, JUDGE_STALL_SLACK_MS } from "./policy";
import type { JudgeRequest, JudgeResponse } from "./types";

const request: JudgeRequest = { state: { reply: "x" }, questions: { contradicts: { type: "noul", instructions: "Does `reply` contradict a fact?" } } };
const answer: JudgeResponse = { model: "jev-1.13.0", answers: { contradicts: { type: "noul", noul: 0.1 } } };

const flush = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
};

describe("F-B1c-2: a page stall is not provider time", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const held = () => {
    let deliver: (value: JudgeResponse) => void = () => undefined;
    const transport = () => new Promise<JudgeResponse>((resolve) => { deliver = resolve; });
    return { transport, deliver: (value: JudgeResponse) => deliver(value) };
  };

  const stall = (ms: number) => jest.setSystemTime(Date.now() + ms);

  it("a budget timer that fires late because the page was blocked waits once more, so an answer already received is kept", async () => {
    const { transport, deliver } = held();
    const result = askJudge(transport, request, { timeoutMs: CONTINUITY_TIMEOUT_MS, use: "warden" });
    await flush();
    stall(1475);
    jest.advanceTimersByTime(CONTINUITY_TIMEOUT_MS);
    deliver(answer);
    await flush();
    await expect(result).resolves.toMatchObject({ answers: answer.answers, latencyMs: 5475 });
  });

  it("control: a timer that fires on time times out, even when the answer comes a moment later", async () => {
    const { transport, deliver } = held();
    const result = askJudge(transport, request, { timeoutMs: CONTINUITY_TIMEOUT_MS, use: "warden" });
    await flush();
    stall(JUDGE_STALL_SLACK_MS);
    jest.advanceTimersByTime(CONTINUITY_TIMEOUT_MS);
    deliver(answer);
    await expect(result).resolves.toMatchObject({ answers: null, fallback: "timeout" });
  });

  it("the grace is one extension only: no answer within it is still a timeout", async () => {
    const { transport } = held();
    const result = askJudge(transport, request, { timeoutMs: CONTINUITY_TIMEOUT_MS, use: "warden" });
    await flush();
    stall(2000);
    jest.advanceTimersByTime(CONTINUITY_TIMEOUT_MS);
    await flush();
    stall(2000);
    jest.advanceTimersByTime(JUDGE_STALL_GRACE_MS);
    await expect(result).resolves.toMatchObject({ answers: null, fallback: "timeout" });
  });

  it("budgetTimer expires on time when nothing blocked the page, and a cleared timer never expires", () => {
    let clock = 0;
    const onTime = jest.fn();
    budgetTimer(1000, onTime, () => clock);
    clock = 1000;
    jest.advanceTimersByTime(1000);
    expect(onTime).toHaveBeenCalledTimes(1);
    const late = jest.fn();
    budgetTimer(1000, late, () => clock);
    clock = 3000;
    jest.advanceTimersByTime(1000);
    expect(late).not.toHaveBeenCalled();
    jest.advanceTimersByTime(JUDGE_STALL_GRACE_MS);
    expect(late).toHaveBeenCalledTimes(1);
    const cleared = jest.fn();
    budgetTimer(1000, cleared, () => clock)();
    jest.advanceTimersByTime(10_000);
    expect(cleared).not.toHaveBeenCalled();
  });
});

import { profileRoute } from "./modelRoute";
import { sendConnectionProfileRequest } from "@services/STAPI";
import { PROBE_TIMEOUT_MS } from "./breaker";
import { TIMEOUT_RETRY_SCALE } from "./callBudget";
import { callExtractionReply, probeModel } from "./client";
import { setAnsweredObserver, type CallAnswered } from "./reply";
import { ModelCallError, retryOnTimeout } from "./modelError";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  sendConnectionProfileRequest: jest.fn(),
}));

const send = sendConnectionProfileRequest as jest.Mock;
const timedOutReply = { ok: false, kind: "timeout", message: "signal timed out" };

let timeout: jest.SpyInstance;
beforeEach(() => {
  send.mockReset();
  timeout = jest.spyOn(AbortSignal, "timeout");
});
afterEach(() => timeout.mockRestore());

describe("A6: the probe takes the budget the breaker hands it", () => {
  it("bounds the probe by the budget it is given and names that budget when it runs out", async () => {
    send.mockResolvedValueOnce(timedOutReply);
    expect(await probeModel("artemis", 60000)).toEqual({ ok: false, kind: "timeout", message: "the memory model did not answer a probe within 60000 ms" });
    expect(timeout).toHaveBeenCalledWith(60000);
  });

  it("control: with no budget it keeps the 10 s floor, and a refusal keeps its own message", async () => {
    send.mockResolvedValueOnce({ ok: false, kind: "transport", message: "API request failed: connect ECONNREFUSED" });
    expect(await probeModel("artemis")).toEqual({ ok: false, kind: "transport", message: "API request failed: connect ECONNREFUSED" });
    expect(timeout).toHaveBeenCalledWith(PROBE_TIMEOUT_MS);
  });
});

describe("A6: every call that answered is reported, so the breaker can see a live host", () => {
  const seen: CallAnswered[] = [];
  let dispose: () => void = () => {};
  beforeEach(() => { seen.length = 0; dispose = setAnsweredObserver((call) => { seen.push(call); }); });
  afterEach(() => dispose());

  it("an answered call reports its profile and how long it took", async () => {
    send.mockResolvedValueOnce({ ok: true, text: "NO_DELTA", finish: "stop" });
    await callExtractionReply("prompt", profileRoute("artemis"));
    expect(seen).toHaveLength(1);
    expect(seen[0].profileId).toBe("artemis");
    expect(Number.isFinite(seen[0].ms) && seen[0].ms >= 0).toBe(true);
  });

  it("control: a failed call, and a debug response, report nothing", async () => {
    send.mockResolvedValueOnce(timedOutReply);
    await callExtractionReply("prompt", profileRoute("artemis")).catch(() => undefined);
    send.mockResolvedValueOnce({ ok: false, kind: "transport", message: "API request failed" });
    await callExtractionReply("prompt", profileRoute("artemis")).catch(() => undefined);
    await callExtractionReply("prompt", profileRoute("artemis"), { debugResponse: "NO_DELTA" });
    expect(seen).toEqual([]);
  });

  it("control: a disposed observer hears nothing", async () => {
    dispose();
    send.mockResolvedValueOnce({ ok: true, text: "NO_DELTA", finish: "stop" });
    await callExtractionReply("prompt", profileRoute("artemis"));
    expect(seen).toEqual([]);
  });
});

describe("A11: a timed-out call is retried once with a larger budget, and then given up honestly", () => {
  const ask = (scale: number) => callExtractionReply("x".repeat(400000), profileRoute("artemis"), { maxTokens: 512, timeoutScale: scale });
  const base = 30000 + 512 * 50 + 100000 * 2;

  it("timeoutScale multiplies the call's own budget", async () => {
    send.mockResolvedValueOnce({ ok: true, text: "NO_DELTA", finish: "stop" });
    await ask(TIMEOUT_RETRY_SCALE);
    expect(timeout).toHaveBeenCalledWith(base * TIMEOUT_RETRY_SCALE);
  });

  it("a call that timed out is asked again with the doubled budget, and its answer is used", async () => {
    send.mockResolvedValueOnce(timedOutReply).mockResolvedValueOnce({ ok: true, text: "NO_DELTA", finish: "stop" });
    expect(await retryOnTimeout(ask)).toEqual({ text: "NO_DELTA", finish: "stop" });
    expect(TIMEOUT_RETRY_SCALE).toBe(2);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([base, base * 2]);
  });

  it("two timeouts give up after exactly two calls, naming both budgets", async () => {
    send.mockResolvedValue(timedOutReply);
    const error = await retryOnTimeout(ask).catch((caught: unknown) => caught);
    expect(send).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(ModelCallError);
    expect(error).toMatchObject({ kind: "timeout", profileId: "artemis", message: `the memory model did not answer within ${base} ms, nor within ${base * 2} ms on one retry` });
  });

  it.each(["transport", "lapsed", "config"] as const)("control: a %s failure is not retried", async (kind) => {
    send.mockResolvedValue({ ok: false, kind, message: `${kind} happened` });
    await expect(retryOnTimeout(ask)).rejects.toMatchObject({ kind, message: `${kind} happened` });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("control: a retry that fails another way reports that failure, not a timeout", async () => {
    send.mockResolvedValueOnce(timedOutReply).mockResolvedValueOnce({ ok: false, kind: "transport", message: "API request failed" });
    await expect(retryOnTimeout(ask)).rejects.toMatchObject({ kind: "transport", message: "API request failed" });
    expect(send).toHaveBeenCalledTimes(2);
  });
});

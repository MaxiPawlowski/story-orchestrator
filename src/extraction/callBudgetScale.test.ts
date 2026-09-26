import { sendConnectionProfileRequest } from "@services/STAPI";
import { callTimeoutMs, debugCallBudgetScale, TIMEOUT_RETRY_SCALE } from "./callBudget";
import { callExtractionReply, retryOnTimeout } from "./client";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  sendConnectionProfileRequest: jest.fn(),
}));

const send = sendConnectionProfileRequest as jest.Mock;
const unscaled = (maxTokens: number, inputTokens = 0) => 30000 + maxTokens * 50 + inputTokens * 2;

let timeout: jest.SpyInstance;
beforeEach(() => {
  send.mockReset();
  timeout = jest.spyOn(AbortSignal, "timeout");
  delete globalThis.storyOrchestratorDebugCallBudgetScale;
});
afterEach(() => {
  timeout.mockRestore();
  delete globalThis.storyOrchestratorDebugCallBudgetScale;
});

describe("v2.5 plan 02 (A11 forced-timeout arm): the debug call-budget scale", () => {
  it("is inert by default: no global, and scale 1, leave every budget unchanged", () => {
    expect(debugCallBudgetScale()).toBe(1);
    expect(callTimeoutMs(512, 88000)).toBe(unscaled(512, 88000));
    globalThis.storyOrchestratorDebugCallBudgetScale = 1;
    expect(callTimeoutMs(512, 88000)).toBe(unscaled(512, 88000));
    expect(callTimeoutMs(96)).toBe(34800);
  });

  it("scales the whole budget, rounded to a whole millisecond", () => {
    globalThis.storyOrchestratorDebugCallBudgetScale = 0.25;
    expect(callTimeoutMs(512, 88000)).toBe(Math.round(unscaled(512, 88000) * 0.25));
    globalThis.storyOrchestratorDebugCallBudgetScale = 1 / 3;
    expect(Number.isInteger(callTimeoutMs(96))).toBe(true);
  });

  it("ignores anything that is not a positive finite number", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "0.5", null]) {
      globalThis.storyOrchestratorDebugCallBudgetScale = bad as never;
      expect(debugCallBudgetScale()).toBe(1);
      expect(callTimeoutMs(512)).toBe(unscaled(512));
    }
  });

  it("a scaled call times out at the scaled budget and its one retry gets twice that", async () => {
    globalThis.storyOrchestratorDebugCallBudgetScale = 0.5;
    send.mockResolvedValue({ ok: false, kind: "timeout", message: "signal timed out" });
    const prompt = "x".repeat(4000);
    const first = Math.round(unscaled(256, 1000) * 0.5);
    await expect(retryOnTimeout((timeoutScale) => callExtractionReply(prompt, { profileId: "artemis", role: "read", maxTokens: 256, timeoutScale })))
      .rejects.toThrow(`the memory model did not answer within ${first} ms, nor within ${first * TIMEOUT_RETRY_SCALE} ms on one retry`);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([first, first * TIMEOUT_RETRY_SCALE]);
  });
});

import { releaseAnswer, waitWhileBusy } from "./gpuLeaseAnswer";

test("a lease the broker no longer holds is not a failed release; a refusal or a broken answer is", () => {
  expect(releaseAnswer(true, { released: true })).toEqual({ ok: true, released: true });
  expect(releaseAnswer(true, { released: false })).toEqual({ ok: true, released: false });
  expect(releaseAnswer(false, { error: "Image work is still running; text remains queued." }).ok).toBe(false);
  expect(releaseAnswer(true, null).ok).toBe(false);
});

describe("a render that meets another render's lease waits for it instead of failing", () => {
  const clock = () => { let t = 0; return { now: () => t, sleep: jest.fn(async (ms: number) => { t += ms; }) }; };
  test("busy answers are retried until the lease is granted", async () => {
    const c = clock(), attempt = jest.fn().mockRejectedValueOnce(new Error("An image batch already owns the local GPU.")).mockRejectedValueOnce(new Error("An image batch already owns the local GPU.")).mockResolvedValue({ lease: "l", brokered: true });
    await expect(waitWhileBusy(attempt, c)).resolves.toEqual({ lease: "l", brokered: true });
    expect(attempt).toHaveBeenCalledTimes(3); expect(c.sleep).toHaveBeenCalledTimes(2);
  });
  test("other refusals fail at once; a busy GPU fails after the patience runs out; a cancel stops the wait", async () => {
    const c = clock();
    await expect(waitWhileBusy(jest.fn().mockRejectedValue(new Error("Image admission refused: Insufficient GPU headroom.")), c)).rejects.toThrow("admission refused");
    expect(c.sleep).not.toHaveBeenCalled();
    const d = clock(), busy = jest.fn().mockRejectedValue(new Error("An image batch already owns the local GPU."));
    await expect(waitWhileBusy(busy, { ...d, patienceMs: 6000, stepMs: 1500 })).rejects.toThrow("already owns");
    expect(busy).toHaveBeenCalledTimes(5);
    const abort = new AbortController(), e = clock();
    e.sleep.mockImplementation(async () => { abort.abort(new Error("cancelled")); });
    await expect(waitWhileBusy(busy, { ...e, signal: abort.signal })).rejects.toThrow("cancelled");
  });
});

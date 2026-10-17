import { waitWhileBusy } from "./leaseWait";

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
  test("host RAM short for an image is retried on a slower step until it frees, within the patience, and a cancel stops it", async () => {
    const short = new Error("Image admission refused: Insufficient physical RAM headroom. RAM available 10175 MiB; workload 8139 + reserve 4096 MiB. Host RAM is short for this image; the render waits and retries when RAM frees up, and the reserve is kept.");
    const c = clock(), attempt = jest.fn().mockRejectedValueOnce(short).mockRejectedValueOnce(short).mockResolvedValue({ lease: "l", brokered: true });
    await expect(waitWhileBusy(attempt, c)).resolves.toEqual({ lease: "l", brokered: true });
    expect(c.sleep.mock.calls.map((call) => call[0])).toEqual([20000, 20000]);
    const d = clock(), always = jest.fn().mockRejectedValue(short);
    await expect(waitWhileBusy(always, { ...d, patienceMs: 60000 })).rejects.toThrow("Host RAM is short");
    expect(always).toHaveBeenCalledTimes(4);
    const abort = new AbortController(), e = clock();
    e.sleep.mockImplementation(async () => { abort.abort(new Error("cancelled")); });
    await expect(waitWhileBusy(always, { ...e, signal: abort.signal })).rejects.toThrow("cancelled");
  });
});

import { mayRetainBatch, SpriteBatchLease } from "./batchLease";

describe("warm batch retention reads the broker's own reserves (v2.7 31 §B)", () => {
  const idle = { adapter: "managed", guarding: true, activeText: 0, waitingText: 0, gpuFreeMiB: 6000, ramAvailableMiB: 9000 };

  it("retains only while free memory covers the reserves the broker reports", () => {
    expect(mayRetainBatch({ ...idle, reserveGpuMiB: 2048, reserveRamMiB: 4096 })).toBe(true);
    expect(mayRetainBatch({ ...idle, reserveGpuMiB: 7000, reserveRamMiB: 4096 })).toBe(false);
    expect(mayRetainBatch({ ...idle, reserveGpuMiB: 2048, reserveRamMiB: 10000 })).toBe(false);
  });

  it("falls back to releasing when the broker names no reserves, is busy, or is absent", () => {
    expect(mayRetainBatch(idle)).toBe(false);
    expect(mayRetainBatch({ ...idle, reserveGpuMiB: 0, reserveRamMiB: 0, activeText: 1 })).toBe(false);
    expect(mayRetainBatch({ ...idle, reserveGpuMiB: 0, reserveRamMiB: 0, adapter: "none" })).toBe(false);
    expect(mayRetainBatch(null)).toBe(false);
  });
});

const fixture = () => {
  const state = { owns: true, retain: true };
  const lease = { release: jest.fn(async () => undefined), renew: jest.fn(async () => undefined) };
  const create = jest.fn(async () => lease);
  const wait = jest.fn(async () => undefined);
  const timers: Array<() => void> = [];
  const batch = new SpriteBatchLease({ current: () => state.owns, mayRetain: async () => state.retain,
    waitForText: wait, schedule: (work) => { timers.push(work); return work; }, unschedule: () => undefined, failed: () => undefined });
  return { state, lease, create, wait, timers, batch };
};

describe("bounded warm sprite batch", () => {
  it("reserves the unit before awaiting, so concurrent callers cannot borrow it", async () => {
    const f = fixture();
    const first = f.batch.acquire("same", f.create);
    await expect(f.batch.acquire("same", f.create)).rejects.toThrow("Finish the current");
    await (await first).release();
    await f.batch.close();
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it("keeps one real lease for three same-workflow frames, then physically releases it", async () => {
    const f = fixture();
    for (let i = 0; i < 3; i++) await (await f.batch.acquire("same", f.create)).release();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.lease.renew).toHaveBeenCalledTimes(2);
    expect(f.lease.release).toHaveBeenCalledTimes(1);
  });

  it("a waiting text request or lost headroom releases at the current frame boundary", async () => {
    const f = fixture(), unit = await f.batch.acquire("same", f.create);
    f.state.retain = false;
    await unit.release();
    expect(f.lease.release).toHaveBeenCalledTimes(1);
  });

  it("rechecks text before starting the next image, even when it arrived after the prior boundary", async () => {
    const f = fixture();
    await (await f.batch.acquire("same", f.create)).release();
    f.state.retain = false;
    await f.batch.acquire("same", f.create);
    expect(f.lease.release).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledTimes(2);
  });

  it("a different workflow cannot borrow the prior admission", async () => {
    const f = fixture();
    await (await f.batch.acquire("a", f.create)).release();
    await f.batch.acquire("b", f.create);
    expect(f.lease.release).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledTimes(2);
  });

  it("the gap timeout and explicit close release once without any new render", async () => {
    const f = fixture();
    await (await f.batch.acquire("same", f.create)).release();
    f.timers[0]();
    await f.batch.close();
    expect(f.lease.release).toHaveBeenCalledTimes(1);
  });

  it("a chat switch during reservation releases the late grant rather than using it", async () => {
    const f = fixture();
    await expect(f.batch.acquire("same", async () => { f.state.owns = false; return f.lease; })).rejects.toThrow("no longer owns");
    expect(f.lease.release).toHaveBeenCalledTimes(1);
  });
});

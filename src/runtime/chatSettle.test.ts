import { CHAT_SETTLE_POLL_MS, ChatSettle } from "./chatSettle";
import { gatedInterceptor, LoudGenerationGate } from "./loudGenerationGate";

const fakeClock = () => {
  let now = 0;
  return { now: () => now, sleep: async (ms: number) => { now += ms; await Promise.resolve(); } };
};

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("ChatSettle: a reply waits for the chat it is written in (T1-7, v2.6 plan 15)", () => {
  it("goes ahead at once when no chat load is in flight", async () => {
    await expect(new ChatSettle(fakeClock()).until(() => false)).resolves.toBe("settled");
  });

  it("waits while a load is in flight and the story is not this chat's, and goes ahead once it is", async () => {
    const settle = new ChatSettle(fakeClock());
    const load = deferred();
    void settle.track(load.promise);
    let owned = false;
    let polls = 0;
    const outcome = await settle.until(() => { polls += 1; if (polls === 3) owned = true; return owned; });
    expect(outcome).toBe("owned");
    expect(polls).toBe(3);
    load.resolve();
  });

  it("goes ahead when the load finishes without a story for this chat", async () => {
    const settle = new ChatSettle(fakeClock());
    const load = deferred();
    const tracked = settle.track(load.promise);
    const waiting = settle.until(() => false);
    load.resolve();
    await tracked;
    await expect(waiting).resolves.toBe("settled");
  });

  it("gives up after the timeout so a stuck load never blocks the chat", async () => {
    const settle = new ChatSettle(fakeClock());
    void settle.track(new Promise<void>(() => undefined));
    await expect(settle.until(() => false, CHAT_SETTLE_POLL_MS * 5)).resolves.toBe("timed-out");
  });

  it("a failed load still counts as finished", async () => {
    const settle = new ChatSettle(fakeClock());
    await expect(settle.track(Promise.reject(new Error("load failed")))).rejects.toThrow("load failed");
    expect(settle.loading()).toBe(false);
  });

  it("the interceptor holds before the scan-time work starts", async () => {
    const order: string[] = [];
    const hold = deferred();
    const interceptor = gatedInterceptor(new LoudGenerationGate(), () => true, async () => { order.push("inner"); }, undefined,
      async () => { order.push("hold"); await hold.promise; order.push("released"); });
    const running = interceptor([], 0, () => undefined, "normal");
    await Promise.resolve();
    expect(order).toEqual(["hold"]);
    hold.resolve();
    await running;
    expect(order).toEqual(["hold", "released", "inner"]);
  });
});

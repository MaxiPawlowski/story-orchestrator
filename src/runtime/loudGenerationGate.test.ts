import { gatedInterceptor, LoudGenerationGate } from "./loudGenerationGate";

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("LoudGenerationGate (T1-2 payloads #39/#40: one request posted twice)", () => {
  it("refuses a second loud group generation that reaches the interceptor while the first is still open", async () => {
    const gate = new LoudGenerationGate();
    const slow = deferred();
    const posted: string[] = [];
    const inner = jest.fn(async (_chat: unknown, _size: number, _abort: (immediate: boolean) => void, type: string) => {
      await slow.promise;
      posted.push(type);
    });
    const interceptor = gatedInterceptor(gate, () => true, inner);
    const first = { aborted: false };
    const second = { aborted: false };
    const running = interceptor([], 8192, () => { first.aborted = true; }, "normal");
    await interceptor([], 8192, () => { second.aborted = true; }, "normal");
    slow.resolve();
    await running;
    expect(first.aborted).toBe(false);
    expect(second.aborted).toBe(true);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(posted).toEqual(["normal"]);
    expect(gate.refused()).toBe(1);
  });

  it("admits the next member once the first reply closed", async () => {
    const gate = new LoudGenerationGate();
    const interceptor = gatedInterceptor(gate, () => true, async () => undefined);
    const aborts: boolean[] = [];
    await interceptor([], 1, (immediate) => aborts.push(immediate), "normal");
    gate.release();
    await interceptor([], 1, (immediate) => aborts.push(immediate), "normal");
    expect(aborts).toEqual([]);
  });

  it("frees the gate when the generation it admitted is vetoed, so the drafted replacement can run", async () => {
    const gate = new LoudGenerationGate();
    let veto = true;
    const interceptor = gatedInterceptor(gate, () => true, async (_chat, _size, abort) => { if (veto) abort(false); });
    const aborts: boolean[] = [];
    await interceptor([], 1, (immediate) => aborts.push(immediate), "normal");
    veto = false;
    await interceptor([], 1, (immediate) => aborts.push(immediate), "normal");
    expect(aborts).toEqual([false]);
    expect(gate.isHeld()).toBe(true);
  });

  it("v2.7 plan 03: does nothing in a one-on-one chat, where no story runs; never gates non-normal generations", async () => {
    const gate = new LoudGenerationGate();
    const aborts: boolean[] = [];
    const inner = jest.fn(async () => undefined);
    const solo = gatedInterceptor(gate, () => false, inner);
    await solo([], 1, (immediate) => aborts.push(immediate), "normal");
    await solo([], 1, (immediate) => aborts.push(immediate), "normal");
    expect(inner).not.toHaveBeenCalled();
    expect(gate.isHeld()).toBe(false);
    const group = gatedInterceptor(gate, () => true, async () => undefined);
    await group([], 1, (immediate) => aborts.push(immediate), "normal");
    for (const type of ["quiet", "swipe", "continue", "impersonate", "regenerate"]) await group([], 1, (immediate) => aborts.push(immediate), type);
    expect(aborts).toEqual([]);
  });
});

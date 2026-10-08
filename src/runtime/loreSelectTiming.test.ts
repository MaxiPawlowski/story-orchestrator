import { loreSelectTiming, type LoreSelectTrigger } from "./loreSelectTiming";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

const setup = (addsUserMessage = true) => {
  const calls: LoreSelectTrigger[] = [];
  const gate = deferred();
  let settled = false;
  const timing = loreSelectTiming({
    active: () => true,
    willAddUserMessage: () => addsUserMessage,
    select: (trigger) => { calls.push(trigger); return gate.promise.then(() => { settled = true; }); },
  });
  return { timing, calls, gate, settled: () => settled };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("loreSelectTiming", () => {
  it("does not hold MESSAGE_SENT behind the lore selection", async () => {
    const { timing, calls } = setup();
    await timing.onGenerationStarted("normal", {}, false);
    let returned = false;
    void timing.onMessageSent().then(() => { returned = true; });
    await flush();
    expect(calls).toEqual(["MESSAGE_SENT"]);
    expect(returned).toBe(true);
  });

  it("makes the interceptor wait for a selection started at MESSAGE_SENT", async () => {
    const { timing, gate, settled } = setup();
    await timing.onGenerationStarted("normal", {}, false);
    await timing.onMessageSent();
    let intercepted = false;
    const intercept = timing.onIntercept("normal", false).then(() => { intercepted = true; });
    await flush();
    expect(intercepted).toBe(false);
    gate.resolve();
    await intercept;
    expect(settled()).toBe(true);
    expect(intercepted).toBe(true);
    expect(timing.pending()).toBeNull();
  });

  it("selects at the interceptor when no player line is added", async () => {
    const { timing, calls, gate } = setup(false);
    await timing.onGenerationStarted("swipe", {}, false);
    await timing.onMessageSent();
    expect(calls).toEqual([]);
    gate.resolve();
    await timing.onIntercept("swipe", false);
    expect(calls).toEqual(["GENERATION_STARTED"]);
  });

  it("selects nothing for a quiet generation", async () => {
    const { timing, calls } = setup();
    await timing.onGenerationStarted("quiet", {}, false);
    await timing.onMessageSent();
    await timing.onIntercept("quiet", false);
    expect(calls).toEqual([]);
  });
});

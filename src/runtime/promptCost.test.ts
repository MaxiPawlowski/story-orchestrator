import { readFileSync } from "fs";
import { join } from "path";
import { PROMPT_COST_DEBOUNCE_MS, PromptCost, type PromptCostHost } from "./promptCost";

const flush = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
};

const host = (patch: Partial<PromptCostHost> = {}) => {
  const calls: string[] = [];
  const notified = { count: 0 };
  const value: PromptCostHost = {
    count: async (text) => {
      calls.push(text);
      return text.length * 2;
    },
    budget: () => ({ ok: true, context: 1000, response: 100, prompt: 900, api: "textgenerationwebui" }),
    notify: () => {
      notified.count += 1;
    },
    busy: () => false,
    ...patch,
  };
  return { value, calls, notified };
};

describe("prompt cost cache (v2.4 plan 08 T19a)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("never counts synchronously: request returns before any count, and the count lands after the debounce", async () => {
    const cost = new PromptCost();
    const { value, calls, notified } = host();
    cost.attach(value);
    expect(cost.request(["alpha"])).toBeUndefined();
    expect(calls).toEqual([]);
    expect(cost.countOf("alpha")).toBeNull();
    jest.advanceTimersByTime(PROMPT_COST_DEBOUNCE_MS);
    await flush();
    expect(calls).toEqual(["alpha"]);
    expect(cost.countOf("alpha")).toEqual({ tokens: 10, source: "host" });
    expect(notified.count).toBe(1);
  });

  it("counts each distinct value once, however often it is requested", async () => {
    const cost = new PromptCost();
    const { value, calls } = host();
    cost.attach(value);
    cost.request(["alpha", "alpha", "beta"]);
    cost.request(["alpha"]);
    jest.advanceTimersByTime(PROMPT_COST_DEBOUNCE_MS);
    await flush();
    cost.request(["alpha", "beta"]);
    jest.advanceTimersByTime(PROMPT_COST_DEBOUNCE_MS);
    await flush();
    expect(calls).toEqual(["alpha", "beta"]);
  });

  it("waits out a generation instead of counting beside it", async () => {
    const cost = new PromptCost();
    let generating = true;
    const { value, calls } = host({ busy: () => generating });
    cost.attach(value);
    cost.request(["alpha"]);
    jest.advanceTimersByTime(PROMPT_COST_DEBOUNCE_MS * 3);
    await flush();
    expect(calls).toEqual([]);
    generating = false;
    jest.advanceTimersByTime(PROMPT_COST_DEBOUNCE_MS);
    await flush();
    expect(calls).toEqual(["alpha"]);
  });

  it("falls back to the chars/4 estimate when the tokenizer fails, and says it is an estimate", async () => {
    const cost = new PromptCost();
    const { value } = host({ count: async () => { throw new Error("tokenize endpoint unreachable"); } });
    cost.attach(value);
    cost.request(["x".repeat(40)]);
    jest.advanceTimersByTime(PROMPT_COST_DEBOUNCE_MS);
    await flush();
    expect(cost.countOf("x".repeat(40))).toEqual({ tokens: 10, source: "estimate" });
  });

  it("does not notify when nothing new was counted, so a notify cannot loop back into a count", async () => {
    const cost = new PromptCost();
    const { value, notified } = host();
    cost.attach(value);
    cost.request([]);
    jest.advanceTimersByTime(PROMPT_COST_DEBOUNCE_MS);
    await flush();
    expect(notified.count).toBe(0);
  });

  it("reports the budget unread when nothing is attached, and the interceptor's budget once it is seen", () => {
    const cost = new PromptCost();
    expect(cost.view()).toEqual({ budget: null, lastGenerationBudget: null });
    cost.attach(host().value);
    cost.noteGenerationBudget(97704);
    expect(cost.view()).toEqual({ budget: { ok: true, context: 1000, response: 100, prompt: 900, api: "textgenerationwebui" }, lastGenerationBudget: 97704 });
    cost.noteGenerationBudget(Number.NaN);
    expect(cost.view().lastGenerationBudget).toBe(97704);
  });

  it("forgets its counts and stops its timer when detached", async () => {
    const cost = new PromptCost();
    const { value, calls } = host();
    const detach = cost.attach(value);
    cost.request(["alpha"]);
    detach();
    jest.advanceTimersByTime(PROMPT_COST_DEBOUNCE_MS);
    await flush();
    expect(calls).toEqual([]);
  });
});

describe("prompt cost stays off the reply path (architecture)", () => {
  const read = (file: string) => readFileSync(join(__dirname, file), "utf8");
  const generation = read("wiring/generation.ts");
  const talk = read("wiring/talk.ts");
  const wiring = [read("index.ts"), generation, talk, read("wiring/lore.ts"), read("wiring/scheduler.ts"), read("wiring/judgeScene.ts")].join("\n");
  const handlerBlock = generation.slice(generation.indexOf("const intentHandlers"), generation.indexOf("export const attachGenerationObservers"))
    + generation.slice(generation.indexOf("export const subscribeGenerationEvents"));

  it("no generation handler requests a count or awaits the cost cache", () => {
    expect(handlerBlock.length).toBeGreaterThan(200);
    expect(handlerBlock).not.toMatch(/promptCost\.(request|attach)/);
    expect(wiring).not.toMatch(/await\s+promptCost/);
  });

  it("the interceptor only records the budget it is handed", () => {
    const interceptor = talk.slice(talk.indexOf("globalThis.talkControlInterceptor ="));
    expect(interceptor).toMatch(/promptCost\.noteGenerationBudget\(/);
    expect(interceptor).not.toMatch(/promptCost\.(request|attach|countOf)/);
  });
});

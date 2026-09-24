import { DEFAULT_CONTEXT_LIMIT, TRUNCATION_MARKER, inputBudget, tailFit, type BudgetMessage, type FitOptions } from "./inputBudget";

const window = (ids: number[], text: (id: number) => string = (id) => `message ${id} `.repeat(4)) => ({
  from: ids[0] ?? 0,
  to: ids[ids.length - 1] ?? 0,
  messages: ids.map((messageId): BudgetMessage => ({ messageId, text: text(messageId) })),
});

const chars: FitOptions["count"] = (text) => text.length;

describe("v2.4 plan 03 D5: the input budget", () => {
  it("is the context limit less the reply and a 10% margin", () => {
    expect(inputBudget({ value: DEFAULT_CONTEXT_LIMIT, source: "default" }, 512)).toEqual({ contextLimit: { value: 8192, source: "default" }, maxTokens: 512, margin: 820, input: 6860 });
    expect(inputBudget({ value: 98304, source: "preset" }, 1024).input).toBe(98304 - 1024 - 9831);
  });

  it("never goes negative, and an unusable limit falls back to the declared default", () => {
    expect(inputBudget({ value: 600, source: "preset" }, 1024).input).toBe(0);
    expect(inputBudget({ value: Number.NaN, source: "preset" }, 512).input).toBe(6860);
  });
});

describe("v2.4 plan 03 D5: tail-fit for DELTA reads", () => {
  it("never exceeds the budget and records trimmedFrom", () => {
    const source = window([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const options: FitOptions = { budget: 260, promptOverhead: 60, count: chars, perMessage: 2 };
    const fit = tailFit(source, options);
    if (!fit.ok) throw new Error(fit.reason);
    const measured = fit.messages.reduce((sum, message) => sum + message.text.length + 2, 0);
    expect(measured).toBeLessThanOrEqual(200);
    expect(fit.tokens).toBe(measured);
    expect(fit.trimmedFrom).toBe(10);
    expect(fit.to).toBe(19);
    expect(fit.messages.map((message) => message.messageId)).toEqual(source.messages.slice(-fit.messages.length).map((message) => message.messageId));
    expect(fit.from).toBe(fit.messages[0].messageId);
    const oneMore = source.messages[source.messages.length - fit.messages.length - 1];
    expect(measured + oneMore.text.length + 2).toBeGreaterThan(200);
    expect(fit.truncated).toEqual([]);
  });

  it("control: a window under the budget is sent whole and records no trim", () => {
    const source = window([3, 4, 5]);
    const fit = tailFit(source, { budget: 10000, promptOverhead: 100, count: chars });
    expect(fit).toMatchObject({ ok: true, from: 3, to: 5, trimmedFrom: null, truncated: [] });
    if (fit.ok) expect(fit.messages).toEqual(source.messages);
  });

  it("a newest message larger than the room is truncated with the marker, never dropped", () => {
    const source = window([1, 2], (id) => (id === 2 ? "y".repeat(400) : "short"));
    const fit = tailFit(source, { budget: 150, promptOverhead: 50, count: chars });
    if (!fit.ok) throw new Error(fit.reason);
    expect(fit.messages.map((message) => message.messageId)).toEqual([2]);
    expect(fit.messages[0].text.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(fit.tokens).toBeLessThanOrEqual(100);
    expect(fit).toMatchObject({ from: 2, trimmedFrom: 1, truncated: [2] });
  });

  it("an empty window stays empty and untrimmed", () => {
    expect(tailFit({ from: 4, to: 3, messages: [] }, { budget: 100, promptOverhead: 0, count: chars })).toEqual({ ok: true, from: 4, to: 3, messages: [], tokens: 0, trimmedFrom: null, truncated: [] });
  });

  it("a prompt that leaves no room is refused with a reason", () => {
    expect(tailFit(window([1]), { budget: 10, promptOverhead: 30, count: chars })).toMatchObject({ ok: false, capacity: -20, reason: expect.stringContaining("no room") });
  });
});

// v2.4 plan 03 D5. The chunker's contract, stated once and searched by a seeded generator: every
// window fits the room left after the prompt, the windows cover the messages in order with nothing
// skipped or repeated, a window closes only when the next message would not fit, and a message too
// large for any window is truncated with the marker and flagged — never dropped. Seeds are fixed so a
// failure is reproducible by name.

import { chunkMessages } from "./chunker";
import { TRUNCATION_MARKER, type BudgetMessage, type FitOptions, type TokenCounter } from "./inputBudget";

const ITERATIONS = 300;
const SEEDS = [1, 7, 20260924, 424242];

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const COUNTERS: Array<[string, TokenCounter]> = [
  ["chars/4", (text) => Math.ceil(text.length / 4)],
  ["words", (text) => text.split(/\s+/).filter(Boolean).length],
  ["chars/3 + 1", (text) => Math.ceil(text.length / 3) + 1],
];

const WORDS = ["the", "road", "north", "washed", "out", "Mara", "keeps", "the", "lantern", "lit", "while", "Kael", "argues"];

const generate = (random: () => number) => {
  const count = Math.floor(random() * 30);
  const messages: BudgetMessage[] = [];
  let messageId = Math.floor(random() * 5);
  for (let index = 0; index < count; index += 1) {
    const length = random() < 0.1 ? 80 + Math.floor(random() * 200) : 1 + Math.floor(random() * 40);
    const words = Array.from({ length }, () => WORDS[Math.floor(random() * WORDS.length)]);
    messages.push({ messageId, text: words.join(" ") });
    messageId += 1 + (random() < 0.2 ? Math.floor(random() * 3) : 0);
  }
  const [name, count_] = COUNTERS[Math.floor(random() * COUNTERS.length)];
  const promptOverhead = Math.floor(random() * 60);
  const options: FitOptions = { budget: promptOverhead + 40 + Math.floor(random() * 200), promptOverhead, count: count_, perMessage: Math.floor(random() * 4) };
  return { messages, options, name };
};

const cost = (text: string, options: FitOptions) => options.count(text) + (options.perMessage ?? 0);

describe("v2.4 plan 03 D5: the summary chunker packs whole messages under the budget", () => {
  it.each(SEEDS)("property (seed %i): every window fits, windows cover the range in order with no gap, oversized is flagged", (seed) => {
    const random = rng(seed);
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      const { messages, options, name } = generate(random);
      const label = `seed ${seed} iteration ${iteration} counter ${name}`;
      const plan = chunkMessages(messages, options);
      if (!plan.ok) throw new Error(`${label}: refused (${plan.reason})`);
      const capacity = options.budget - options.promptOverhead;
      expect({ label, capacity: plan.capacity }).toEqual({ label, capacity });

      const covered = plan.windows.flatMap((window) => window.messages.map((message) => message.messageId));
      expect({ label, covered }).toEqual({ label, covered: messages.map((message) => message.messageId) });

      plan.windows.forEach((window, index) => {
        const measured = window.messages.reduce((sum, message) => sum + cost(message.text, options), 0);
        expect({ label, index, fits: measured <= capacity, tokens: window.tokens }).toEqual({ label, index, fits: true, tokens: measured });
        expect({ label, index, from: window.from, to: window.to }).toEqual({ label, index, from: window.messages[0].messageId, to: window.messages[window.messages.length - 1].messageId });
        const next = plan.windows[index + 1];
        if (next) {
          const following = messages.findIndex((message) => message.messageId === window.to) + 1;
          expect({ label, index, nextFrom: next.from }).toEqual({ label, index, nextFrom: messages[following].messageId });
          expect({ label, index, closedEarly: window.tokens + cost(next.messages[0].text, options) <= capacity }).toEqual({ label, index, closedEarly: false });
        }
      });

      const oversized = messages.filter((message) => cost(message.text, options) > capacity).map((message) => message.messageId);
      expect({ label, oversized: plan.oversized }).toEqual({ label, oversized });
      expect({ label, flagged: plan.windows.flatMap((window) => window.truncated) }).toEqual({ label, flagged: oversized });
      for (const window of plan.windows) {
        for (const message of window.messages) {
          const truncated = oversized.includes(message.messageId);
          expect({ label, id: message.messageId, marked: message.text.endsWith(TRUNCATION_MARKER) }).toEqual({ label, id: message.messageId, marked: truncated });
        }
      }
    }
  });

  it("a single oversized message keeps its head and the marker, in a window of its own, flagged", () => {
    const count: TokenCounter = (text) => text.length;
    const huge = "x".repeat(500);
    const plan = chunkMessages([{ messageId: 3, text: "abc" }, { messageId: 4, text: huge }, { messageId: 5, text: "def" }], { budget: 120, promptOverhead: 20, count });
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.oversized).toEqual([4]);
    expect(plan.windows.map((window) => [window.from, window.to])).toEqual([[3, 3], [4, 4], [5, 5]]);
    const kept = plan.windows[1].messages[0].text;
    expect(kept.startsWith("xxx")).toBe(true);
    expect(kept.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(kept.length).toBeLessThanOrEqual(100);
    expect(plan.windows[1].truncated).toEqual([4]);
  });

  it("control: messages that fit share a window and nothing is truncated", () => {
    const plan = chunkMessages([{ messageId: 0, text: "aa" }, { messageId: 1, text: "bb" }], { budget: 100, promptOverhead: 10, count: (text) => text.length });
    expect(plan).toEqual({ ok: true, capacity: 90, oversized: [], windows: [{ from: 0, to: 1, tokens: 4, truncated: [], messages: [{ messageId: 0, text: "aa" }, { messageId: 1, text: "bb" }] }] });
  });

  it("a prompt that leaves no room is refused with a reason, not packed", () => {
    expect(chunkMessages([{ messageId: 0, text: "aa" }], { budget: 50, promptOverhead: 50, count: (text) => text.length })).toMatchObject({ ok: false, capacity: 0 });
    expect(chunkMessages([{ messageId: 0, text: "aa" }], { budget: 60, promptOverhead: 50, count: (text) => text.length })).toMatchObject({ ok: false, reason: expect.stringContaining("smaller than a truncated message") });
  });

  it("a message cap closes a window that still has room, and packing stays in order", () => {
    const messages = Array.from({ length: 5 }, (_, messageId) => ({ messageId, text: "aa" }));
    const plan = chunkMessages(messages, { budget: 1000, promptOverhead: 0, count: (text) => text.length, maxMessages: 2 });
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.windows.map((window) => [window.from, window.to])).toEqual([[0, 1], [2, 3], [4, 4]]);
  });

  it("no messages is an empty plan, not a refusal", () => {
    expect(chunkMessages([], { budget: 100, promptOverhead: 0, count: (text) => text.length })).toEqual({ ok: true, capacity: 100, windows: [], oversized: [] });
  });
});

import { entryTokens, estimateTokens, selectWithinBudget, tierTokenCost } from "./budget";
import type { MemoryEntry } from "./types";

const entry = (overrides: Partial<MemoryEntry>): MemoryEntry => ({
  id: overrides.id ?? `id-${Math.random()}`,
  tier: "facts",
  text: "text",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: "evidence",
  createdAt: 0,
  recallCount: 0,
  ...overrides,
});

describe("token counting", () => {
  it("estimates tokens from length when not precomputed", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(entryTokens(entry({ text: "abcdefgh" }))).toBe(2);
  });

  it("prefers the precomputed token count", () => {
    expect(entryTokens(entry({ text: "abcdefgh", tokens: 99 }))).toBe(99);
  });

  it("sums tier cost", () => {
    expect(tierTokenCost([entry({ tokens: 3 }), entry({ tokens: 7 })])).toBe(10);
  });
});

describe("selectWithinBudget", () => {
  const score = (e: MemoryEntry) => e.importance;

  it("always keeps pinned entries even past budget", () => {
    const entries = [entry({ id: "p", tokens: 100, pinned: true }), entry({ id: "a", tokens: 5, importance: 3 })];
    const { kept } = selectWithinBudget(entries, 10, score);
    expect(kept.has("p")).toBe(true);
    expect(kept.has("a")).toBe(false);
  });

  it("keeps highest-scored entries within budget", () => {
    const entries = [
      entry({ id: "low", tokens: 10, importance: 1 }),
      entry({ id: "high", tokens: 10, importance: 3 }),
    ];
    const { kept, dropped } = selectWithinBudget(entries, 10, score);
    expect(kept.has("high")).toBe(true);
    expect(dropped.map((e) => e.id)).toEqual(["low"]);
  });

  it("honors a diversity floor across types before greedy fill", () => {
    const entries = [
      entry({ id: "f1", type: "fact", tokens: 10, importance: 3 }),
      entry({ id: "f2", type: "fact", tokens: 10, importance: 3 }),
      entry({ id: "r1", type: "relationship", tokens: 10, importance: 1 }),
    ];
    const { kept } = selectWithinBudget(entries, 20, score, 1);
    expect(kept.has("f1")).toBe(true);
    expect(kept.has("r1")).toBe(true);
    expect(kept.has("f2")).toBe(false);
  });
});

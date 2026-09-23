import { BLOCK_OVERHEAD_TOKENS, blockTokens, entryTokens, estimateTokens, selectWithinBudget, tierTokenCost } from "./budget";
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

  // v2.3 plan 05 (M7): what a tier costs is the block it renders, not the raw text of its rows.
  it("charges the block's own formatting on top of the text", () => {
    expect(blockTokens(entry({ tokens: 5 }))).toBe(5 + BLOCK_OVERHEAD_TOKENS);
  });
});

describe("selectWithinBudget", () => {
  const score = (e: MemoryEntry) => e.importance;

  it("keeps a pinned entry ahead of a better-scored candidate", () => {
    const entries = [entry({ id: "p", tokens: 5, pinned: true }), entry({ id: "a", tokens: 5, importance: 3 })];
    const { kept } = selectWithinBudget(entries, 10, score);
    expect(kept.has("p")).toBe(true);
    expect(kept.has("a")).toBe(false);
  });

  // M7: a pinned row is not a licence to blow the budget silently — the author is told instead.
  it("reports a pinned entry the budget cannot fit", () => {
    const entries = [entry({ id: "p", tokens: 100, pinned: true })];
    const { kept, dropped, pinnedOverflow } = selectWithinBudget(entries, 10, score);
    expect(kept.has("p")).toBe(false);
    expect(dropped.map((e) => e.id)).toEqual(["p"]);
    expect(pinnedOverflow).toBe(1);
  });

  it("keeps highest-scored entries within budget", () => {
    const entries = [
      entry({ id: "low", tokens: 10, importance: 1 }),
      entry({ id: "high", tokens: 10, importance: 3 }),
    ];
    const { kept, dropped, pinnedOverflow } = selectWithinBudget(entries, 12, score);
    expect(kept.has("high")).toBe(true);
    expect(dropped.map((e) => e.id)).toEqual(["low"]);
    expect(pinnedOverflow).toBe(0);
  });

  it("honors a diversity floor across types before greedy fill", () => {
    const entries = [
      entry({ id: "f1", type: "fact", tokens: 10, importance: 3 }),
      entry({ id: "f2", type: "fact", tokens: 10, importance: 3 }),
      entry({ id: "r1", type: "relationship", tokens: 10, importance: 1 }),
    ];
    const { kept } = selectWithinBudget(entries, 24, score, 1);
    expect(kept.has("f1")).toBe(true);
    expect(kept.has("r1")).toBe(true);
    expect(kept.has("f2")).toBe(false);
  });
});

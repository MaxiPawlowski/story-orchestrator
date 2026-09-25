import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { buildForeignRows, buildNextTurnCost, buildNextTurnPreview, nextTurnCostText, positionLabel, type NextTurnSourceBlock, type TokenCount } from "./nextTurn";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
}));

const block = (key: string, depth: number, value: string, patch: Partial<NextTurnSourceBlock> = {}): NextTurnSourceBlock => ({ key, depth, role: 0, value, position: 1, hasFilter: false, ...patch });

const counted = (table: Record<string, TokenCount>) => (value: string): TokenCount | null => table[value] ?? null;

const baseFacts = { draftedMember: null, scene: null, sceneFallback: null };

const budget = { ok: true as const, context: 98304, response: 600, prompt: 97704, api: "textgenerationwebui" };

describe("next-turn cost (v2.4 plan 08 T19a)", () => {
  it("gives each story row its token count and its share of the prompt budget", () => {
    const rows = buildNextTurnPreview([block(INJECTION_REGISTRY.pacing.key, 2, "steer"), block(INJECTION_REGISTRY.memoryFacts.key, 4, "facts")], {
      ...baseFacts,
      countOf: counted({ steer: { tokens: 100, source: "host" }, facts: { tokens: 300, source: "host" } }),
      budget,
    });
    expect(rows.map((row) => [row.tokens, row.tokenSource])).toEqual([[100, "host"], [300, "host"]]);
    expect(rows[1].share).toBeCloseTo(300 / 97704, 8);
  });

  it("says counting for a block whose count has not landed, and never invents one", () => {
    const [row] = buildNextTurnPreview([block(INJECTION_REGISTRY.pacing.key, 2, "steer")], { ...baseFacts, countOf: () => null, budget });
    expect(row).toMatchObject({ tokens: null, tokenSource: null, share: null });
  });

  it("totals the story blocks as a share of the budget: share = sum of tokens / budget", () => {
    const rows = buildNextTurnPreview([block("story_a", 1, "a"), block("story_b", 2, "b")], { ...baseFacts, countOf: counted({ a: { tokens: 40, source: "host" }, b: { tokens: 60, source: "estimate" } }), budget });
    const cost = buildNextTurnCost(rows, [], budget, null);
    expect(cost).toMatchObject({ ownTokens: 100, budget: 97704, counting: 0, estimated: true });
    expect(cost.share).toBeCloseTo(100 / 97704, 8);
    expect(nextTurnCostText(cost)).toContain("100 tokens of 97,704 available (max context − response)");
  });

  it("renders an unknown budget as unknown, not as zero, and says why", () => {
    const rows = buildNextTurnPreview([block("story_a", 1, "a")], { ...baseFacts, countOf: counted({ a: { tokens: 40, source: "host" } }), budget: { ok: false, reason: "this build exports no getMaxPromptTokens from script.js" } });
    expect(rows[0].share).toBeNull();
    const cost = buildNextTurnCost(rows, [], { ok: false, reason: "this build exports no getMaxPromptTokens from script.js" }, null);
    expect(cost.budget).toBeNull();
    expect(cost.share).toBeNull();
    expect(nextTurnCostText(cost)).toContain("budget unknown");
    expect(nextTurnCostText(cost)).not.toMatch(/of 0 /);
    expect(nextTurnCostText(buildNextTurnCost(rows, [], null, null))).toContain("budget unknown");
  });

  it("does not total while any story block is still being counted", () => {
    const rows = buildNextTurnPreview([block("story_a", 1, "a"), block("story_b", 2, "b")], { ...baseFacts, countOf: counted({ a: { tokens: 40, source: "host" } }), budget });
    const cost = buildNextTurnCost(rows, [], budget, 97704);
    expect(cost).toMatchObject({ ownTokens: null, counting: 1, share: null, lastGenerationBudget: 97704 });
    expect(nextTurnCostText(cost)).toContain("counting");
  });

  it("carries position and the conditional flag on story rows too", () => {
    const [row] = buildNextTurnPreview([block("story_a", 1, "a", { position: 0, hasFilter: true })], baseFacts);
    expect(row).toMatchObject({ position: 0, conditional: true });
  });
});

describe("foreign blocks, read-only (v2.4 plan 08 T19b)", () => {
  it("lists another extension's block the story rows leave out, in ST's assembly order", () => {
    const rows = buildForeignRows([block("zz_tracker", 4, "later"), block("3_vectors", 2, "Relevant memories:\nthe lighthouse")], counted({ later: { tokens: 5, source: "host" } }), budget);
    expect(rows.map((row) => row.key)).toEqual(["3_vectors", "zz_tracker"]);
    expect(rows[0]).toMatchObject({ firstLine: "Relevant memories:", tokens: null });
    expect(rows[1]).toMatchObject({ tokens: 5, tokenSource: "host" });
    expect(Object.keys(rows[0])).not.toEqual(expect.arrayContaining(["owner", "ownerTab"]));
  });

  it("labels position NONE as not injected, macro only", () => {
    const [row] = buildForeignRows([block("some_macro_source", 0, "x", { position: -1 })], () => null, budget);
    expect(row.positionLabel).toBe("not injected; macro only");
    expect(positionLabel(0)).toBe("in prompt");
    expect(positionLabel(1)).toBe("in chat");
    expect(positionLabel(2)).toBe("before prompt");
  });

  it("names a /inject block by its id, and flags a block ST may skip as conditional", () => {
    const [row] = buildForeignRows([block("script_inject_mood", 1, "calm", { hasFilter: true })], () => null, budget);
    expect(row).toMatchObject({ label: "/inject mood", conditional: true });
  });

  it("totals the foreign blocks apart from the story's own", () => {
    const foreign = buildForeignRows([block("x", 1, "p"), block("y", 1, "q", { position: -1 })], counted({ p: { tokens: 7, source: "host" }, q: { tokens: 3, source: "host" } }), budget);
    expect(buildNextTurnCost([], foreign, budget, null).foreignTokens).toBe(7);
  });
});

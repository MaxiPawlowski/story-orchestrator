import { CALL_TIMEOUT_BASE_MS, MAX_TOKENS_TABLE, callTimeoutMs, maxTokensFor, maxTokensForInput } from "./callBudget";

describe("callBudget: one declared table for every memory-model call (v2.4 plan 03 D2/D6)", () => {
  it("allows 30 s plus a 20 tok/s floor for the response it asked for", () => {
    expect(callTimeoutMs(512)).toBe(30000 + 512 * 50);
    expect(callTimeoutMs(96)).toBe(34800);
    expect(callTimeoutMs(0)).toBe(CALL_TIMEOUT_BASE_MS);
    expect(callTimeoutMs(-5)).toBe(CALL_TIMEOUT_BASE_MS);
  });

  it("adds a 500 tok/s prefill floor for the prompt it sends, so a window near the input budget is not timed out while it is still being read", () => {
    expect(callTimeoutMs(512, 88000)).toBe(30000 + 512 * 50 + 88000 * 2);
    expect(callTimeoutMs(512, 0)).toBe(callTimeoutMs(512));
    expect(callTimeoutMs(512, -10)).toBe(callTimeoutMs(512));
    expect(callTimeoutMs(512, 67720)).toBeGreaterThan(55600 + 75641);
  });

  it("keeps the shared read fixed at 1024 whatever the input, because MAX_DELTAS_PER_READ bounds its answer", () => {
    expect(maxTokensFor("sharedRead", 0)).toBe(1024);
    expect(maxTokensFor("sharedRead", 40000)).toBe(1024);
  });

  it("scales a summary with its input between the floor and the cap", () => {
    expect(maxTokensFor("sceneSummary", 100)).toBe(256);
    expect(maxTokensFor("sceneSummary", 2000)).toBe(500);
    expect(maxTokensFor("sceneSummary", 100000)).toBe(1024);
    expect(maxTokensFor("canon", 10)).toBe(1536);
    expect(maxTokensFor("canon", 4182)).toBe(2091);
    expect(maxTokensFor("canon", 100000)).toBe(3072);
    expect(maxTokensFor("epistemic", 10)).toBe(1280);
    expect(maxTokensFor("ledger", 10)).toBe(768);
    expect(maxTokensFor("epistemic", 6000)).toBe(1500);
    expect(maxTokensFor("epistemic", 100000)).toBe(1536);
    expect(maxTokensFor("curator", 10)).toBe(384);
    expect(maxTokensFor("curator", 100000)).toBe(1024);
  });

  it("declares every pass family the plan names, with a floor at or under its cap", () => {
    for (const [family, budget] of Object.entries(MAX_TOKENS_TABLE)) {
      if ("fixed" in budget) continue;
      expect({ family, ordered: budget.floor <= budget.cap }).toEqual({ family, ordered: true });
    }
    expect(Object.keys(MAX_TOKENS_TABLE).sort()).toEqual(["arcSummary", "canon", "chapterSeal", "curator", "epistemic", "ledger", "sceneSummary", "sharedRead", "shortTerm"]);
  });

  it("reads a prompt's input at four characters a token", () => {
    expect(maxTokensForInput("sceneSummary", "x".repeat(8000))).toBe(500);
    expect(maxTokensForInput("sceneSummary", "")).toBe(256);
  });
});

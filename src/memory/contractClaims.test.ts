import {
  buildEpistemicPassPrompt, buildSceneReducePrompt, buildSceneSummaryPrompt, buildShortTermSummaryPrompt, CLAIM_RULE, PRIVATE_MEMORY_RULE, PRIVATE_TELLING_RULE,
  renderMemoryContractAddendum, SHARED_SUMMARY_PRIVACY_RULE,
} from "./contract";

const RONAN_LINE = "She told me the seals were weakening.";

describe("T2-2: a claim made in dialogue is not evidence, and a private telling is a held secret (journal.jsonl:848, memory-tab-after-stop.txt:172)", () => {
  it("the shared read's memory contract says a claimed off-screen event is recorded as said, never as a fact", () => {
    expect(renderMemoryContractAddendum([], false)).toContain(CLAIM_RULE);
    expect(CLAIM_RULE).toMatch(/not evidence/);
  });

  it("the shared read's knowledge lines and the epistemic pass carry both rules", () => {
    const shared = renderMemoryContractAddendum([], true);
    const pass = buildEpistemicPassPrompt(`Ronan: ${RONAN_LINE}`, ["Ronan", "Shiya"]);
    for (const prompt of [shared, pass]) {
      expect(prompt).toContain(PRIVATE_TELLING_RULE);
      expect(prompt).toContain(CLAIM_RULE);
    }
    expect(PRIVATE_TELLING_RULE).toContain("[hiding] Teller from");
  });
});

describe("T7-1 secret spread: the shared summaries and memory rows are asked to leave private disclosures out (payloads.jsonl:102)", () => {
  it("every summary every member reads carries the privacy rule", () => {
    for (const prompt of [buildShortTermSummaryPrompt(null, "x"), buildShortTermSummaryPrompt("y", "x"), buildSceneSummaryPrompt("x"), buildSceneReducePrompt("x")]) {
      expect(prompt).toContain(SHARED_SUMMARY_PRIVACY_RULE);
    }
  });

  it("the shared read's memory contract tags a private telling to its one listener", () => {
    expect(renderMemoryContractAddendum([], false)).toContain(PRIVATE_MEMORY_RULE);
  });
});

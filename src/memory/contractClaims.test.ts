import { buildEpistemicPassPrompt, CLAIM_RULE, PRIVATE_TELLING_RULE, renderMemoryContractAddendum } from "./contract";

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

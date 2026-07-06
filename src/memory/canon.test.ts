import { buildCanonSummaryPrompt, canonInputHash } from "./canon";

describe("canonInputHash", () => {
  it("is stable for identical inputs and differs when inputs change", () => {
    const a = canonInputHash(["arc one resolved", "arc two resolved"], ["fact a", "fact b"]);
    const b = canonInputHash(["arc one resolved", "arc two resolved"], ["fact a", "fact b"]);
    const c = canonInputHash(["arc one resolved", "arc two resolved"], ["fact a", "fact c"]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("does not confuse an arc summary with a fact of the same text", () => {
    expect(canonInputHash(["shared text"], [])).not.toBe(canonInputHash([], ["shared text"]));
  });
});

describe("buildCanonSummaryPrompt", () => {
  it("includes the story title, resolved arc summaries, and key facts", () => {
    const prompt = buildCanonSummaryPrompt("The Vault", ["The heist unravelled."], ["Elara distrusts the guild."]);
    expect(prompt).toContain("STORY: The Vault");
    expect(prompt).toContain("The heist unravelled.");
    expect(prompt).toContain("Elara distrusts the guild.");
    expect(prompt).toContain("WHAT HAS HAPPENED:");
  });

  it("renders (none) placeholders when inputs are empty", () => {
    const prompt = buildCanonSummaryPrompt("Empty", [], []);
    expect(prompt).toContain("RESOLVED ARC SUMMARIES: (none)");
    expect(prompt).toContain("KEY FACTS: (none)");
  });
});

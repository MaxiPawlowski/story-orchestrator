import { buildCanonSummaryPrompt, canonHistory, canonInputHash } from "./canon";

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

  it("goes stale when the story moves to another checkpoint", () => {
    const at = (id: string) => canonInputHash(["arc"], ["fact"], { id, name: id, objective: "" });
    expect(at("gate")).toBe(at("gate"));
    expect(at("gate")).not.toBe(at("chapel"));
    expect(at("gate")).not.toBe(canonInputHash(["arc"], ["fact"]));
  });
});

describe("canonHistory", () => {
  it("keeps only WHAT HAS HAPPENED, whose CURRENT STATE live state already covers", () => {
    const text = "WHAT HAS HAPPENED:\nThe party reached Wendhope.\nThey found it silent.\n\nCURRENT STATE:\nThey prepare to embark.\n\nESTABLISHED FACTS:\nBelle is a healer.";
    expect(canonHistory(text)).toBe("The party reached Wendhope.\nThey found it silent.");
    expect(canonHistory("What has happened: the siege ended. Established facts: the chapel stands.")).toBe("the siege ended. Established facts: the chapel stands.");
  });

  it("keeps unlabelled text whole", () => {
    expect(canonHistory("  A plain summary.  ")).toBe("A plain summary.");
    expect(canonHistory("")).toBe("");
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

  it("anchors CURRENT STATE at the checkpoint the story is at", () => {
    const prompt = buildCanonSummaryPrompt("The Vault", ["The heist unravelled."], [], { id: "chapel", name: "First night", objective: "Survive the siege" });
    expect(prompt).toContain("CURRENT CHECKPOINT: First night — Survive the siege");
    expect(buildCanonSummaryPrompt("The Vault", [], [])).not.toContain("CURRENT CHECKPOINT");
  });

  it("renders (none) placeholders when inputs are empty", () => {
    const prompt = buildCanonSummaryPrompt("Empty", [], []);
    expect(prompt).toContain("RESOLVED ARC SUMMARIES: (none)");
    expect(prompt).toContain("KEY FACTS: (none)");
  });
});

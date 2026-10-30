import { focusCandidates, focusPick, namesAny } from "./focus";

const draws = (count: number) => Array.from({ length: count }, (_, index) => (index + 0.5) / count);

describe("v2.8 49 focusPick (pure, shared with 48)", () => {
  it("drops arcs naming an unmet person or place, keeps a known secret-holder, applies the resting filter", () => {
    const resting = (text: string) => text.replace(/\s*\[secret:[^\]]*\]/g, "");
    const candidates = focusCandidates({
      arcs: ["Maren hides the harbour ledger [secret: she sold the oil]", "the stranger called Corvin at the pier", "the dark lanterns", "the dark lanterns"],
      members: [{ name: "Maren", present: true }, { name: "Corvin", present: true }, { name: "Tobin", present: false }],
      unknownNames: ["Corvin", "Saltmarsh"], resting,
    });
    expect(candidates).toEqual([
      { kind: "arc", text: "Maren hides the harbour ledger" }, { kind: "arc", text: "the dark lanterns" }, { kind: "member", text: "Maren" },
    ]);
  });

  it("matches names on word boundaries, case-insensitively", () => {
    expect(namesAny("the Corvin affair", ["corvin"])).toBe(true);
    expect(namesAny("Corvinas the boat", ["Corvin"])).toBe(false);
    expect(namesAny("anything", [" ", "a"])).toBe(false);
  });

  it("a one-character name or alias is a whole token too: Q filters its arc, never an unrelated word", () => {
    expect(focusCandidates({ arcs: ["Q waits at the gate", "the quay at dusk", "Queen Ash's banner"], unknownNames: ["Q"], resting: (text) => text }))
      .toEqual([{ kind: "arc", text: "the quay at dusk" }, { kind: "arc", text: "Queen Ash's banner" }]);
    expect(namesAny("the note from q.", ["Q"])).toBe(true);
    expect(namesAny("Quiet and quick", ["Q"])).toBe(false);
  });

  it("picks each candidate at its share over 10,000 draws, and nothing from an empty list", () => {
    const candidates = ["a", "b", "c"].map((text) => ({ kind: "arc" as const, text }));
    const counts = new Map<string, number>();
    draws(10_000).forEach((unit) => { const pick = focusPick(candidates, unit); if (pick) counts.set(pick.text, (counts.get(pick.text) ?? 0) + 1); });
    expect([...counts.values()].every((count) => Math.abs(count / 10_000 - 1 / 3) <= 0.02)).toBe(true);
    expect(focusPick([], 0.5)).toBeNull();
    expect(focusPick(candidates, 0.9999999)?.text).toBe("c");
  });
});

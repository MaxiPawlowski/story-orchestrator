import { createMemoryState } from "./stores";
import { clearContradicted, markContradicted, parseSupersessionVerdicts } from "./supersede";
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

describe("markContradicted / clearContradicted", () => {
  it("marks the existing side of each uncertain pair", () => {
    const state = { ...createMemoryState(), entries: [entry({ id: "old" }), entry({ id: "new" })] };
    const marked = markContradicted(state, [{ candidateId: "new", existingId: "old" }]);
    expect(marked.entries.find((e) => e.id === "old")?.contradicted).toBe(true);
    expect(marked.entries.find((e) => e.id === "new")?.contradicted).toBeUndefined();
  });

  it("clears a contradiction flag", () => {
    const state = { ...createMemoryState(), entries: [entry({ id: "old", contradicted: true })] };
    const cleared = clearContradicted(state, ["old"]);
    expect(cleared.entries.find((e) => e.id === "old")?.contradicted).toBe(false);
  });
});

describe("parseSupersessionVerdicts", () => {
  it("parses SUPERSEDE and INDEPENDENT verdict lines", () => {
    const verdicts = parseSupersessionVerdicts("SUPERSEDE 0\nINDEPENDENT 2\nnoise");
    expect(verdicts.get(0)).toBe(true);
    expect(verdicts.get(2)).toBe(false);
    expect(verdicts.size).toBe(2);
  });
});

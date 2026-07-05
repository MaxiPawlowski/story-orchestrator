import { applyConsolidation, buildJaccardMatchSets, consolidateTier } from "./consolidate";
import { createMemoryState } from "./stores";
import type { MemoryEntry } from "./types";

let seq = 0;
const entry = (overrides: Partial<MemoryEntry>): MemoryEntry => ({
  id: overrides.id ?? `id-${(seq += 1)}`,
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

const run = (entries: MemoryEntry[]) => consolidateTier(entries, buildJaccardMatchSets(entries));

describe("consolidateTier", () => {
  it("drops a near-identical duplicate and confirms the survivor", () => {
    const entries = [
      entry({ id: "a", text: "Kael carries a silver dagger", createdAt: 1 }),
      entry({ id: "b", text: "Kael carries a silver dagger", createdAt: 2 }),
    ];
    const result = run(entries);
    expect(result.droppedIds).toEqual(["b"]);
    expect(result.confirmedIds).toEqual(["a"]);
  });

  it("supersedes an older same-topic fact when the newer one has a state-change marker", () => {
    const entries = [
      entry({ id: "old", text: "Mara trusts the player and helps freely", createdAt: 1 }),
      entry({ id: "new", text: "Mara no longer trusts the player and helps freely", createdAt: 2 }),
    ];
    const result = run(entries);
    expect(result.supersededPairs).toEqual([{ loserId: "old", winnerId: "new" }]);
    expect(result.droppedIds).toEqual([]);
  });

  it("never drops or supersedes a pinned entry", () => {
    const entries = [
      entry({ id: "pin", text: "Kael carries a silver dagger", createdAt: 1, pinned: true }),
      entry({ id: "dup", text: "Kael carries a silver dagger", createdAt: 2 }),
    ];
    const result = run(entries);
    expect(result.droppedIds).toEqual(["dup"]);
    expect(result.supersededPairs).toEqual([]);
  });

  it("queues an ambiguous same-topic pair as uncertain rather than dropping it", () => {
    const entries = [
      entry({ id: "a", text: "the northern tavern serves warm ale nightly", createdAt: 1 }),
      entry({ id: "b", text: "the northern tavern serves cold mead nightly", createdAt: 2 }),
    ];
    const result = run(entries);
    expect(result.droppedIds).toEqual([]);
    expect(result.uncertain.map((u) => u.candidateId)).toContain("b");
  });
});

describe("applyConsolidation", () => {
  it("removes dropped entries, links superseded, and bumps confirmed recall", () => {
    const state = { ...createMemoryState(), entries: [
      entry({ id: "a", recallCount: 0 }),
      entry({ id: "old" }),
      entry({ id: "dup" }),
    ] };
    const next = applyConsolidation(state, {
      droppedIds: ["dup"],
      supersededPairs: [{ loserId: "old", winnerId: "a" }],
      confirmedIds: ["a"],
      uncertain: [],
    });
    expect(next.entries.map((e) => e.id)).toEqual(["a", "old"]);
    expect(next.entries.find((e) => e.id === "old")?.supersededBy).toBe("a");
    expect(next.entries.find((e) => e.id === "a")?.recallCount).toBe(1);
  });

  it("clears a contradiction flag when the entry is re-confirmed", () => {
    const state = { ...createMemoryState(), entries: [entry({ id: "a", contradicted: true })] };
    const next = applyConsolidation(state, { droppedIds: [], supersededPairs: [], confirmedIds: ["a"], uncertain: [] });
    expect(next.entries.find((e) => e.id === "a")?.contradicted).toBe(false);
  });
});

import { applyConsolidation, buildJaccardMatchSets, candidatePairs, consolidateTier, consolidateTierJudged, type PairRelation } from "./consolidate";
import { createMemoryState } from "./stores";
import type { MemoryEntry } from "./types";
import { DEFAULT_DEDUP_THRESHOLDS as DEFAULTS } from "./consolidate";

let seq = 0;
const entry = (overrides: Partial<MemoryEntry>) => ({
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
}) as MemoryEntry;

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
    }, undefined as never);
    expect(next.entries.map((e) => e.id)).toEqual(["a", "old"]);
    expect(next.entries.find((e) => e.id === "old")?.supersededBy).toBe("a");
    expect(next.entries.find((e) => e.id === "a")?.recallCount).toBe(1);
  });

  it("clears a contradiction flag when the entry is re-confirmed", () => {
    const state = { ...createMemoryState(), entries: [entry({ id: "a", contradicted: true })] };
    const next = applyConsolidation(state, { droppedIds: [], supersededPairs: [], confirmedIds: ["a"], uncertain: [] }, { messageId: 1 });
    expect(next.entries.find((e) => e.id === "a")?.contradicted).toBe(false);
  });
});

describe("consolidateTierJudged (v2.2 plan 02)", () => {
  const judged = (entries: MemoryEntry[], relations: Record<string, PairRelation>) =>
    consolidateTierJudged(entries, buildJaccardMatchSets(entries), (olderId, newerId) => relations[`${olderId}>${newerId}`] ?? null);

  it("with no answers, decides exactly like consolidateTier", () => {
    const entries = [
      entry({ id: "a", text: "Arin carries a curved blade from a pirate captain", createdAt: 1 }),
      entry({ id: "b", text: "Arin carries a curved blade taken from a pirate captain", createdAt: 2 }),
      entry({ id: "c", text: "The party is in the guild hall today", createdAt: 3 }),
      entry({ id: "d", text: "The party is now in the ruins today", createdAt: 4 }),
    ];
    const { clearedIds, ...rest } = judged(entries, {});
    expect(rest).toEqual(run(entries));
    expect(clearedIds).toEqual([]);
  });

  it("drops a judged duplicate, supersedes a judged update, and keeps a judged distinct pair", () => {
    const dup = judged([entry({ id: "a", text: "the guild pays 250 crowns for the heart", createdAt: 1 }), entry({ id: "b", text: "the guild will pay two hundred and fifty crowns for the heart", createdAt: 2 })], { "a>b": "duplicate" });
    const dupEntries = [entry({ id: "a", text: "the guild pays 250 crowns for the heart", createdAt: 1 }), entry({ id: "b", text: "the guild will pay two hundred and fifty crowns for the heart", createdAt: 2 })];
    expect(candidatePairs(dupEntries, buildJaccardMatchSets(dupEntries, { ...DEFAULTS, jaccardSameTopic: 0.2 }))).toHaveLength(1);
    const lowFloor = consolidateTierJudged(dupEntries, buildJaccardMatchSets(dupEntries, { ...DEFAULTS, jaccardSameTopic: 0.2 }), () => "duplicate");
    expect(lowFloor.droppedIds).toEqual(["b"]);
    expect(lowFloor.confirmedIds).toEqual(["a"]);
    expect(dup.droppedIds).toEqual([]);

    const update = consolidateTierJudged(
      [entry({ id: "a", text: "Luke is staying home with their mother", createdAt: 1 }), entry({ id: "b", text: "Luke is joining the expedition with the party", createdAt: 2 })],
      { dup: [new Set(), new Set()], sameTopic: [new Set(), new Set([0])] },
      () => "update",
    );
    expect(update.supersededPairs).toEqual([{ loserId: "a", winnerId: "b" }]);

    const distinct = consolidateTierJudged(
      [entry({ id: "a", text: "Tommy Sayer is hiding at the safehouse", createdAt: 1, contradicted: true }), entry({ id: "b", text: "Tommy Sayer's brother is hiding at the safehouse", createdAt: 2 })],
      { dup: [new Set(), new Set([0])], sameTopic: [new Set(), new Set()] },
      () => "distinct",
    );
    expect(distinct).toMatchObject({ droppedIds: [], supersededPairs: [], uncertain: [], clearedIds: ["a"] });
  });

  it("leaves a pair alone when the lookup says none (surfaced only by the judge's wider net)", () => {
    const result = consolidateTierJudged(
      [entry({ id: "a", text: "x", createdAt: 1, contradicted: true }), entry({ id: "b", text: "y", createdAt: 2 })],
      { dup: [new Set(), new Set()], sameTopic: [new Set(), new Set([0])] },
      () => "none",
    );
    expect(result).toMatchObject({ droppedIds: [], supersededPairs: [], uncertain: [], clearedIds: [] });
  });

  it("supersedes a pinned older entry when the judge says update", () => {
    // v2.3 plan 05 (M5): pin is retention, not truth. A pin protects a row from trimming and
    // expiry; it does not freeze what the story says, which is what a lock is for.
    const result = consolidateTierJudged(
      [entry({ id: "a", text: "x", createdAt: 1, pinned: true }), entry({ id: "b", text: "y", createdAt: 2 })],
      { dup: [new Set(), new Set()], sameTopic: [new Set(), new Set([0])] },
      () => "update",
    );
    expect(result.supersededPairs).toEqual([{ loserId: "a", winnerId: "b" }]);
  });

  it("never supersedes a LOCKED older entry, even when the judge says update", () => {
    const result = consolidateTierJudged(
      [entry({ id: "a", text: "x", createdAt: 1, locked: true }), entry({ id: "b", text: "y", createdAt: 2 })],
      { dup: [new Set(), new Set()], sameTopic: [new Set(), new Set([0])] },
      () => "update",
    );
    expect(result.supersededPairs).toEqual([]);
    expect(result.uncertain).toEqual([{ candidateId: "b", existingId: "a" }]);
  });

  it("lists candidate pairs oldest-first, flagging dup-band pairs", () => {
    const entries = [entry({ id: "b", createdAt: 2 }), entry({ id: "a", createdAt: 1 })];
    const pairs = candidatePairs(entries, { dup: [new Set([1]), new Set()], sameTopic: [new Set(), new Set()] });
    expect(pairs.map((pair) => [pair.older.id, pair.newer.id, pair.dup])).toEqual([["a", "b", true]]);
  });
});

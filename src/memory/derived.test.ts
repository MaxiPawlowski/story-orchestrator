import { disappearingEntries, recordDerived, rollbackDerived, type DerivedInput, type DerivedRecord } from "./derived";
import { excludeEntry, hashMemoryText, createMemoryState } from "./stores";
import { reverseMemoryState, type MemoryRollbackState } from "./reverse";
import type { ArcEntry, MemoryEntry } from "./types";

// v2.3 plan 04. The half of the rollback contract that is not about messages: an artifact built from
// rows has to go when the rows do, and it has to give back what it removed. Each case here is one of
// the six kinds the plan names.

const entry = (id: string, messageId: number, text = `fact ${id}`) => ({
  id,
  tier: "facts",
  text,
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: `evidence ${id}`,
  createdAt: messageId,
  messageId,
  recallCount: 0,
}) as Partial<MemoryEntry> as MemoryEntry;

const record = (overrides: Partial<DerivedRecord> = {}): DerivedRecord => ({ ...recordDerived([], { kind: "canon", inputs: [], boundary: 1, messageId: 10 })[0], ...overrides });
const removed = (...ids: string[]) => new Set(ids);

describe("derived artifacts reverse with their inputs", () => {
  it("drops an artifact built at or after the rollback point", () => {
    const records = [record({ messageId: 4 }), record({ messageId: 5 }), record({ messageId: 9 })];
    const reversal = rollbackDerived(records, 5, removed());
    expect(reversal.dropped).toHaveLength(2);
    expect(reversal.records).toHaveLength(1);
    expect(reversal.records[0].messageId).toBe(4);
  });

  it("drops an artifact whose span starts at the point even when the pass ran later", () => {
    const reversal = rollbackDerived([record({ messageId: 40, range: { from: 7, to: 40 } })], 7, removed());
    expect(reversal.dropped).toHaveLength(1);
  });

  it("drops an artifact built from a row this rollback removed", () => {
    const reversal = rollbackDerived([record({ messageId: 1, inputs: ["f1", "f2"] })], 9, removed("f1"));
    expect(reversal.dropped).toHaveLength(1);
    expect(reversal.records).toEqual([]);
  });

  it("keeps an artifact whose inputs this rollback left alone", () => {
    const reversal = rollbackDerived([record({ messageId: 1, inputs: ["f1"] })], 9, removed());
    expect(reversal.dropped).toEqual([]);
    expect(reversal.reDerive).toBe(false);
  });

  it("names the artifact kinds whose output the next pass re-synthesises", () => {
    const reversal = rollbackDerived([record({ kind: "exclusion", messageId: 9 }), record({ kind: "canon", messageId: 9 })], 9, removed());
    expect(reversal.reDerive).toBe(true);
  });

  it("gives back the rows a dedup deleted", () => {
    const losers = [entry("m2", 3), entry("m3", 4)];
    const reversal = rollbackDerived([record({ kind: "dedup", messageId: 6, inputs: ["m1"], removed: losers })], 6, removed());
    expect(reversal.restored.map((row) => row.id)).toEqual(["m2", "m3"]);
  });

  it("never restores a row the cut never had", () => {
    const reversal = rollbackDerived([record({ kind: "dedup", messageId: 6, removed: [entry("m2", 3), entry("m9", 8)] })], 6, removed());
    expect(reversal.restored.map((row) => row.id)).toEqual(["m2"]);
  });

  it("keeps a shared hash excluded while an older exclusion survives", () => {
    const records = [
      record({ kind: "exclusion", messageId: 3, hash: "same" }),
      record({ kind: "exclusion", messageId: 8, hash: "same" }),
    ];
    expect(rollbackDerived(records, 8, removed()).lifted).toEqual([]);
    expect(rollbackDerived(records, 3, removed()).lifted).toEqual(["same"]);
  });

  it("lifts the hash an exclusion wrote, and rewinds to the oldest dropped span", () => {
    const reversal = rollbackDerived([record({ kind: "exclusion", messageId: 9, hash: "abc" }), record({ kind: "short_term", messageId: 9, range: { from: 13, to: 24 } }), record({ kind: "short_term", messageId: 9, range: { from: 6, to: 12 } })], 9, removed());
    expect(reversal.lifted).toEqual(["abc"]);
    expect(reversal.watermark).toBe(5);
  });

  it("drops artifacts transitively when one consumes another's output", () => {
    const records = [
      record({ id: "a", kind: "short_term", messageId: 3, outputId: "s1" }),
      record({ id: "b", kind: "short_term", messageId: 4, inputs: ["s1"], outputId: "s2" }),
    ];
    expect(rollbackDerived(records, 9, removed("s1")).dropped.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("reports the entries a write removed", () => {
    expect(disappearingEntries([entry("a", 1), entry("b", 2)], [entry("a", 1)]).map((row) => row.id)).toEqual(["b"]);
  });

  it("drops every duplicate confirmation made after the cut", () => {
    const survivor: MemoryEntry = {
      ...entry("a", 1),
      recallCount: 3,
      confirmedAt: [{ messageId: 2 }, { messageId: 4 }, { messageId: 6 }],
    };
    const start = { ...createMemoryState(), entries: [survivor], shortTermSummaryEnd: -1, arcs: [], epistemic: [], ledger: [], canon: null, verifyDrops: [], derived: [] };
    const next = reverseMemoryState(start as Partial<MemoryRollbackState> as MemoryRollbackState, 4, 3);
    expect(next.entries?.[0].recallCount).toBe(1);
    expect(next.entries?.[0].confirmedAt).toEqual([{ messageId: 2 }]);
  });
});

describe("a memory rollback through the real composition", () => {
  const state = () => ({
    ...createMemoryState(),
    shortTermSummaryEnd: 12,
    arcs: [],
    epistemic: [],
    ledger: [],
    canon: { text: "WHAT HAS HAPPENED: the bridge went.", inputHash: "h", updatedAt: "" },
    verifyDrops: [],
    derived: [] as DerivedRecord[],
  });

  it("restores an excluded entry, lifts its hash and re-derives the canon", () => {
    const start = { ...state(), entries: [entry("m1", 2), entry("m2", 8)], shortTermSummaryEnd: 12 };
    const excluded = excludeEntry(start, "m1");
    const withRecord = { ...excluded, derived: recordDerived([], { kind: "exclusion", inputs: ["m1"], removed: [entry("m1", 2)], hash: hashMemoryText("fact m1"), boundary: 3, messageId: 8 }) };
    const next = reverseMemoryState(withRecord as Partial<MemoryRollbackState> as MemoryRollbackState, 8, 3);
    expect(next.entries?.map((row) => row.id)).toContain("m1");
    expect(next.excluded).toEqual([]);
    expect(next.derived).toEqual([]);
    expect(next.shortTermSummaryEnd).toBe(12);
  });

  it("rewinds the short-term watermark so the next pass re-reads the span it summarised", () => {
    const start = {
      ...state(),
      entries: [entry("s1", 10, "summary of 1-10")],
      shortTermSummaryEnd: 10,
      derived: recordDerived([], { kind: "short_term", outputId: "s1", range: { from: 1, to: 10 }, removed: [entry("old", 4)], boundary: 4, messageId: 10 } as DerivedInput),
    };
    const rewound = reverseMemoryState(start as Partial<MemoryRollbackState> as MemoryRollbackState, 10, 5);
    expect(rewound.shortTermSummaryEnd).toBe(0);
    expect(rewound.entries?.map((row) => row.id)).toContain("old");
    expect(rewound.entries?.map((row) => row.id)).not.toContain("s1");
  });

  it("drops an arc summary whose source was invalidated", () => {
    const arc: ArcEntry = { id: "a1", text: "Find the ferryman", status: "resolved", entities: [], openedAt: 0, resolvedAt: 2, summary: "He was found." };
    const start = { ...state(), arcs: [arc], derived: recordDerived([], { kind: "arc_summary", inputs: ["a1"], boundary: 4, messageId: 10 }) };
    const rewound = reverseMemoryState(start as Partial<MemoryRollbackState> as MemoryRollbackState, 10, 5);
    expect(rewound.arcs?.[0].summary).toBeUndefined();
  });
});

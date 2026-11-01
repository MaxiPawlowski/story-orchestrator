import { recallCandidates, selectRecall } from "./archiveRecall";
import { capTier, createMemoryState, stripLinksAfter } from "./stores";
import { EVICTED_ARCHIVE, EVICTED_ARCHIVE_CAP, evictWeakest, isEvicted, retentionStamp, stampUsed, strengthOf } from "./strength";
import type { MemoryEntry } from "./types";

const row = (id: string, createdAt: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text: `fact ${id}`, type: "fact", importance: 2, expiration: "permanent", entities: [`E${id}`], confidence: 1, activationTriggers: [],
  evidence: "", createdAt, messageId: createdAt, recallCount: 0, provenance: { source: "extractor", validity: "live" } as MemoryEntry["provenance"], ...extra,
});

const state = (entries: MemoryEntry[]) => ({ ...createMemoryState(), entries });

describe("v3.0 41 B3: strength on the boundary clock", () => {
  it("decays with boundaries since the last use, and a use resets the clock", () => {
    const fresh = row("a", 0);
    expect(strengthOf(fresh, 0)).toBeGreaterThan(strengthOf(fresh, 30));
    const used = { ...fresh, usedAt: [{ messageId: 25, boundary: 25 }] };
    expect(strengthOf(used, 30)).toBeGreaterThan(strengthOf(fresh, 30));
  });

  it("spaced uses slow the decay more than massed ones", () => {
    const spaced = row("s", 0, { usedAt: [{ messageId: 12, boundary: 12 }, { messageId: 24, boundary: 24 }] });
    const massed = row("m", 0, { usedAt: [{ messageId: 23, boundary: 23 }, { messageId: 24, boundary: 24 }] });
    expect(strengthOf(spaced, 60)).toBeGreaterThan(strengthOf(massed, 60));
  });

  it("importance and durability raise strength", () => {
    expect(strengthOf(row("hi", 0, { importance: 3 }), 20)).toBeGreaterThan(strengthOf(row("lo", 0, { importance: 1 }), 20));
    expect(strengthOf(row("p", 0), 20)).toBeGreaterThan(strengthOf(row("s", 0, { expiration: "scene" }), 20));
  });

  it("a use is stamped once per message", () => {
    const once = stampUsed(state([row("a", 0)]), ["a"], { messageId: 5, boundary: 5 });
    const twice = stampUsed(once, ["a"], { messageId: 5, boundary: 5 });
    expect(twice.entries[0].usedAt).toEqual([{ messageId: 5, boundary: 5 }]);
  });

  it("retentionStamp is null when the switch is off", () => {
    expect(retentionStamp({ strengthRetention: false }, 3, 4)).toBeNull();
    expect(retentionStamp({}, 3, 4)).toEqual({ messageId: 3, boundary: 4 });
  });
});

describe("v3.0 41 B3: capTier evicts the weakest into the archive", () => {
  it("without retention the oldest unpinned row is dropped (unchanged)", () => {
    const next = capTier(state([row("old", 0), row("new", 10), row("newer", 20)]), "facts", 2);
    expect(next.entries.map((entry) => entry.id)).toEqual(["new", "newer"]);
  });

  it("with retention a recently used old row survives and the weakest is archived, not dropped", () => {
    const entries = [row("old", 0, { usedAt: [{ messageId: 38, boundary: 38 }] }), row("mid", 10), row("new", 20)];
    const next = capTier(state(entries), "facts", 2, { messageId: 40, boundary: 40 });
    expect(next.entries).toHaveLength(3);
    expect(next.entries.filter(isEvicted).map((entry) => entry.id)).toEqual(["mid"]);
    expect(next.entries.find((entry) => entry.id === "mid")?.evictedAt).toEqual({ messageId: 40, boundary: 40 });
  });

  it("never evicts a pinned, locked or author-decided row", () => {
    const entries = [row("pin", 0, { pinned: true }), row("lock", 0, { locked: true }), row("auth", 0, { provenance: { source: "author", validity: "live" } as MemoryEntry["provenance"] }), row("new", 30)];
    const next = evictWeakest(state(entries), "facts", 2, { messageId: 40, boundary: 40 });
    expect(next.entries.filter(isEvicted).map((entry) => entry.id)).toEqual(["new"]);
  });

  it("the archive is capped, weakest first", () => {
    const entries = Array.from({ length: EVICTED_ARCHIVE_CAP + 5 }, (_, index) => row(`r${index}`, index, { foldedInto: EVICTED_ARCHIVE, evictedAt: { messageId: index, boundary: index } }));
    const next = evictWeakest(state([...entries, row("x", 400), row("y", 401)]), "facts", 1, { messageId: 402, boundary: 402 });
    expect(next.entries.filter(isEvicted)).toHaveLength(EVICTED_ARCHIVE_CAP);
  });

  it("a rollback before the eviction or the use takes both back", () => {
    const evicted = row("e", 0, { foldedInto: EVICTED_ARCHIVE, evictedAt: { messageId: 10, boundary: 10 }, usedAt: [{ messageId: 4, boundary: 4 }, { messageId: 12, boundary: 12 }] });
    const back = stripLinksAfter(evicted, 10);
    expect(back.foldedInto).toBeUndefined();
    expect(back.evictedAt).toBeUndefined();
    expect(back.usedAt).toEqual([{ messageId: 4, boundary: 4 }]);
    expect(stripLinksAfter(evicted, 11).foldedInto).toBe(EVICTED_ARCHIVE);
  });

  it("archive recall brings an evicted row back by entity mention", () => {
    const evicted = row("e", 0, { text: "the smith owes Odo three crowns", entities: ["Odo"], foldedInto: EVICTED_ARCHIVE, evictedAt: { messageId: 10, boundary: 10 } });
    const candidates = recallCandidates([evicted], "Did Odo ever get paid?");
    expect(candidates.map((entry) => entry.id)).toEqual(["e"]);
    const lines = selectRecall(candidates, [], { boundary: 20, turnText: "Did Odo ever get paid?", turnEntities: ["Odo"] });
    expect(lines.map((line) => line.text)).toEqual(["Recalled from earlier: the smith owes Odo three crowns"]);
  });
});

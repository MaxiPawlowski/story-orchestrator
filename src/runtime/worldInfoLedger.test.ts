import { gatedBy, gatedIndex, restorePlan, verifyLedger, type BookEntries } from "./worldInfoLedger";

const story = (books: Record<string, string[]>) => ({ checkpoints: [{ effects: { world_info: { enable: Object.entries(books).map(([lorebook, comments]) => ({ lorebook, comments })) } } }] });

const files = (books: Record<string, Record<string, boolean | null>>) => {
  const reads: string[] = [];
  const read = async (lorebook: string): Promise<BookEntries | null> => {
    reads.push(lorebook);
    const found = Object.entries(books).find(([name]) => name.toLowerCase() === lorebook.toLowerCase());
    return found ? new Map(Object.entries(found[1])) : null;
  };
  return { read, reads };
};

describe("verifyLedger (v2.5 plan 01 B: verify, never trust)", () => {
  const library = [story({ Ruins: ["CP1", "CP2", "CP3"], Archive: ["Old"] })];

  it("reports a normalised entry the file shows enabled as drift, and nothing for one that still rests off", async () => {
    const { read } = files({ Ruins: { CP1: true, CP2: false, CP3: true } });
    const verdict = await verifyLedger({ Ruins: ["CP1", "CP2", "CP3"] }, gatedIndex(library), read);
    expect(verdict.drift).toEqual([{ lorebook: "Ruins", comment: "CP2" }]);
    expect(verdict.missing).toEqual([]);
    expect(verdict.unreadable).toEqual([]);
  });

  it("reads an entry with no disable key as enabled: it is drift too", async () => {
    const { read } = files({ Ruins: { CP1: null } });
    expect((await verifyLedger({ Ruins: ["CP1"] }, gatedIndex(library), read)).drift).toEqual([{ lorebook: "Ruins", comment: "CP1" }]);
  });

  it("control: a ledger whose every entry rests off reports no drift", async () => {
    const { read } = files({ Ruins: { CP1: true, CP2: true }, Archive: { Old: true } });
    const verdict = await verifyLedger({ Ruins: ["CP1", "CP2"], Archive: ["Old"] }, gatedIndex(library), read);
    expect(verdict).toEqual({ drift: [], missing: [], unreadable: [] });
  });

  it("names an entry deleted from its book as missing and an unlisted book as unreadable, never as drift", async () => {
    const { read } = files({ Ruins: { CP1: true } });
    const verdict = await verifyLedger({ Ruins: ["CP1", "CP2"], Archive: ["Old"] }, gatedIndex(library), read);
    expect(verdict.drift).toEqual([]);
    expect(verdict.missing).toEqual([{ lorebook: "Ruins", comment: "CP2" }]);
    expect(verdict.unreadable).toEqual(["Archive"]);
  });

  it("ignores ledger entries no library story gates any more, and matches the book by file id", async () => {
    const { read, reads } = files({ Ruins: { CP1: true, Gone: false } });
    const verdict = await verifyLedger({ ruins: ["CP1", "Gone"], Removed: ["X"] }, gatedIndex(library), read);
    expect(verdict.drift).toEqual([]);
    expect(reads).toEqual(["ruins"]);
  });
});

describe("gatedBy (v2.5 plan 01 D: which story gates an entry)", () => {
  it("names every library story that gates the entry, matching the book by file id", () => {
    const owner = gatedBy([
      { title: "Sun Ruins", raw: story({ Xentar: ["CP1", "CP2"] }) },
      { title: "Crossing", raw: story({ xentar: ["CP2"] }) },
    ]);
    expect(owner("XENTAR", "CP2")).toEqual(["Sun Ruins", "Crossing"]);
    expect(owner("Xentar", "CP1")).toEqual(["Sun Ruins"]);
    expect(owner("Xentar", "Ungated")).toEqual([]);
  });
});

describe("restorePlan (v2.5 plan 01 E: restore on story removal)", () => {
  const removed = story({ Ruins: ["CP1", "CP2", "Shared"] });
  const remaining = [story({ Ruins: ["Shared"] })];
  const from = { Ruins: [{ comment: "CP1", wasOn: true }, { comment: "CP2", wasOn: false }, { comment: "Shared", wasOn: true }] };
  const ledger = { Ruins: ["CP1", "CP2", "Shared"] };

  it("re-enables only what was on before normalisation and no remaining story gates", () => {
    expect(restorePlan(removed, remaining, ledger, from)).toEqual([{ lorebook: "Ruins", comments: ["CP1"] }]);
  });

  it("offers nothing for an entry the ledger no longer holds, or that carries no provenance", () => {
    expect(restorePlan(removed, remaining, { Ruins: ["CP2"] }, from)).toEqual([]);
    expect(restorePlan(removed, remaining, ledger, {})).toEqual([]);
  });
});

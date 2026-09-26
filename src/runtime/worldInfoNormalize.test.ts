import { couldNot, wrote } from "@utils/writeResult";
import type { RunOwnership } from "./runToken";
import { normalizeGatedEntries, spikeBook, type NormalizeDeps } from "./worldInfoNormalize";
import { testOwnership } from "../../test/findings/testOwnership";

const story = (books: Record<string, string[]>) => ({ checkpoints: [{ effects: { world_info: { enable: Object.entries(books).map(([lorebook, comments]) => ({ lorebook, comments })) } } }] });

const host = () => {
  const disk = new Map<string, Map<string, boolean>>([
    ["SO-T13 Ruins", new Map([["CP1", false], ["CP2", false], ["Ungated", false]])],
    ["Adolion", new Map([["Real", false]])],
  ]);
  const calls: Array<[string, string[]]> = [];
  const deps: NormalizeDeps = {
    ownership: testOwnership(),
    onlyBooks: spikeBook,
    present: async (lorebook) => {
      const book = [...disk.entries()].find(([name]) => name.toLowerCase() === lorebook.toLowerCase())?.[1];
      return book ? new Set(book.keys()) : null;
    },
    disable: async (lorebook, comments) => {
      calls.push([lorebook, comments]);
      const book = disk.get(lorebook);
      if (!book) return couldNot(`there is no lorebook "${lorebook}"`);
      let changed = false;
      for (const comment of comments) if (book.get(comment) === false) { book.set(comment, true); changed = true; }
      return wrote({ changed, confirmed: true });
    },
  };
  return { disk, calls, deps };
};

describe("normalizeGatedEntries (v2.4 plan 05 T13 spike, S3)", () => {
  it("flips exactly the gated entries of marker books, once: the second run writes nothing", async () => {
    const { disk, calls, deps } = host();
    const library = [story({ "SO-T13 Ruins": ["CP1", "CP2"], Adolion: ["Real"] })];
    const first = await normalizeGatedEntries(library, {}, deps);
    expect(first.flipped).toEqual({ "SO-T13 Ruins": ["CP1", "CP2"] });
    expect(first.ledger).toEqual({ "SO-T13 Ruins": ["CP1", "CP2"] });
    expect(first.skippedBooks).toEqual(["Adolion"]);
    expect(Object.fromEntries(disk.get("SO-T13 Ruins")!)).toEqual({ CP1: true, CP2: true, Ungated: false });
    expect(disk.get("Adolion")!.get("Real")).toBe(false);
    calls.length = 0;
    const second = await normalizeGatedEntries(library, first.ledger, deps);
    expect(calls).toEqual([]);
    expect(second.writes).toBe(0);
    expect(second.changed).toBe(false);
  });

  it("a gated set that grows normalises only what is new", async () => {
    const { calls, deps } = host();
    const ledger = { "SO-T13 Ruins": ["CP1"] };
    const grown = await normalizeGatedEntries([story({ "SO-T13 Ruins": ["CP1", "CP2"] })], ledger, deps);
    expect(calls).toEqual([["SO-T13 Ruins", ["CP2"]]]);
    expect(grown.ledger).toEqual({ "SO-T13 Ruins": ["CP1", "CP2"] });
  });

  it("never records an entry the book does not hold, so one added later is still normalised", async () => {
    const { calls, deps } = host();
    const outcome = await normalizeGatedEntries([story({ "SO-T13 Ruins": ["CP1", "Not yet written"] })], {}, deps);
    expect(calls).toEqual([["SO-T13 Ruins", ["CP1"]]]);
    expect(outcome.ledger).toEqual({ "SO-T13 Ruins": ["CP1"] });
  });

  it("a refused or unconfirmed write is not recorded as normalised, so the next run retries it", async () => {
    const { deps } = host();
    const refused = await normalizeGatedEntries([story({ "SO-T13 Ruins": ["CP1"] })], {}, { ...deps, disable: async () => couldNot("the server still holds the old flag") });
    expect(refused.refused).toEqual(["the server still holds the old flag"]);
    expect(refused.ledger).toEqual({});
    const blind = await normalizeGatedEntries([story({ "SO-T13 Ruins": ["CP1"] })], {}, { ...deps, disable: async () => wrote({ changed: true, confirmed: false }) });
    expect(blind.ledger).toEqual({});
  });

  it("stops before a write once its run has lapsed", async () => {
    const { calls, deps } = host();
    let owned = true;
    const ownership: RunOwnership = { mint: () => ({}) as never, check: () => (owned ? { ok: true } : { ok: false, reason: "chat" }) as never };
    const present = deps.present;
    const outcome = await normalizeGatedEntries([story({ "SO-T13 Ruins": ["CP1"] })], {}, { ...deps, ownership, present: async (book) => { owned = false; return present(book); } });
    expect(calls).toEqual([]);
    expect(outcome.lapsed).toBe(true);
  });

  it("only books carrying the spike marker are admitted", () => {
    expect(spikeBook("SO-T13 Ruins")).toBe(true);
    expect(spikeBook(" so-t13 shared")).toBe(true);
    expect(spikeBook("Sun Ruins")).toBe(false);
  });
});

import { couldNot, wrote } from "@utils/writeResult";
import type { RunOwnership } from "./runToken";
import { normalizeGatedEntries, type NormalizeDeps } from "./worldInfoNormalize";
import { testOwnership } from "../../test/findings/testOwnership";

const story = (books: Record<string, string[]>) => ({ checkpoints: [{ effects: { world_info: { enable: Object.entries(books).map(([lorebook, comments]) => ({ lorebook, comments })) } } }] });

type FakeEntry = { uid: number; comment: string; content: string; disable?: boolean };

const host = () => {
  const disk = new Map<string, FakeEntry[]>([
    ["Sun Ruins", [
      { uid: 0, comment: "CP1", content: "a", disable: false },
      { uid: 1, comment: "CP2", content: "b", disable: false },
      { uid: 2, comment: "Ungated", content: "c", disable: false },
      { uid: 3, comment: "Resting", content: "d", disable: true },
      { uid: 4, comment: "NoKey", content: "e" },
    ]],
    ["Adolion", [{ uid: 0, comment: "Real", content: "f", disable: false }]],
  ]);
  const find = (lorebook: string) => [...disk.entries()].find(([name]) => name.toLowerCase() === lorebook.toLowerCase());
  const calls: Array<[string, string[]]> = [];
  const deps: NormalizeDeps = {
    ownership: testOwnership(),
    read: async (lorebook) => {
      const book = find(lorebook)?.[1];
      if (!book) return null;
      return new Map(book.map((entry) => [entry.comment, Object.prototype.hasOwnProperty.call(entry, "disable") ? entry.disable === true : null]));
    },
    disable: async (lorebook, comments) => {
      calls.push([lorebook, comments]);
      const book = find(lorebook)?.[1];
      if (!book) return couldNot(`there is no lorebook "${lorebook}"`);
      let changed = false;
      for (const entry of book) if (comments.includes(entry.comment) && entry.disable !== true) { entry.disable = true; changed = true; }
      return wrote({ changed, confirmed: true });
    },
  };
  return { disk, calls, deps };
};

describe("normalizeGatedEntries (v2.5 plan 01 A: production normalisation)", () => {
  it("flips exactly the gated entries of every listed library book, once: the second run writes nothing", async () => {
    const { disk, calls, deps } = host();
    const before = JSON.stringify(disk.get("Sun Ruins")!.filter((entry) => !["CP1", "CP2"].includes(entry.comment)));
    const library = [story({ "Sun Ruins": ["CP1", "CP2"], Adolion: ["Real"] })];
    const first = await normalizeGatedEntries(library, { ledger: {}, from: {} }, deps);
    expect(first.flipped).toEqual({ "Sun Ruins": ["CP1", "CP2"], Adolion: ["Real"] });
    expect(first.ledger).toEqual({ "Sun Ruins": ["CP1", "CP2"], Adolion: ["Real"] });
    expect(disk.get("Sun Ruins")!.filter((entry) => ["CP1", "CP2"].includes(entry.comment)).every((entry) => entry.disable === true)).toBe(true);
    expect(JSON.stringify(disk.get("Sun Ruins")!.filter((entry) => !["CP1", "CP2"].includes(entry.comment)))).toBe(before);
    calls.length = 0;
    const second = await normalizeGatedEntries(library, { ledger: first.ledger, from: first.from }, deps);
    expect(calls).toEqual([]);
    expect(second.writes).toBe(0);
    expect(second.changed).toBe(false);
  });

  it("records what each entry was before it was normalised, and writes nothing for an entry already resting off", async () => {
    const { calls, deps } = host();
    const outcome = await normalizeGatedEntries([story({ "Sun Ruins": ["CP1", "Resting", "NoKey"] })], { ledger: {}, from: {} }, deps);
    expect(calls).toEqual([["Sun Ruins", ["CP1", "NoKey"]]]);
    expect(outcome.alreadyOff).toEqual({ "Sun Ruins": ["Resting"] });
    expect(outcome.from).toEqual({ "Sun Ruins": [{ comment: "CP1", wasOn: true }, { comment: "NoKey", wasOn: true }, { comment: "Resting", wasOn: false }] });
    expect(outcome.ledger).toEqual({ "Sun Ruins": ["CP1", "NoKey", "Resting"] });
  });

  it("a gated set that grows normalises only what is new", async () => {
    const { calls, deps } = host();
    const grown = await normalizeGatedEntries([story({ "Sun Ruins": ["CP1", "CP2"] })], { ledger: { "Sun Ruins": ["CP1"] }, from: { "Sun Ruins": [{ comment: "CP1", wasOn: true }] } }, deps);
    expect(calls).toEqual([["Sun Ruins", ["CP2"]]]);
    expect(grown.ledger).toEqual({ "Sun Ruins": ["CP1", "CP2"] });
    expect(grown.from).toEqual({ "Sun Ruins": [{ comment: "CP1", wasOn: true }, { comment: "CP2", wasOn: true }] });
  });

  it("re-reads a ledger entry only when asked to (the re-normalise action), and keeps its first provenance", async () => {
    const { disk, calls, deps } = host();
    const ledger = { "Sun Ruins": ["CP1"] };
    const from = { "Sun Ruins": [{ comment: "CP1", wasOn: true }] };
    const trusted = await normalizeGatedEntries([story({ "Sun Ruins": ["CP1"] })], { ledger, from }, deps);
    expect(calls).toEqual([]);
    expect(trusted.changed).toBe(false);
    const rechecked = await normalizeGatedEntries([story({ "Sun Ruins": ["CP1"] })], { ledger, from }, { ...deps, recheck: (lorebook, comment) => lorebook === "Sun Ruins" && comment === "CP1" });
    expect(calls).toEqual([["Sun Ruins", ["CP1"]]]);
    expect(disk.get("Sun Ruins")![0].disable).toBe(true);
    expect(rechecked.ledger).toEqual(ledger);
    expect(rechecked.from).toEqual(from);
  });

  it("never records an entry the book does not hold, or a book that is not listed", async () => {
    const { calls, deps } = host();
    const outcome = await normalizeGatedEntries([story({ "Sun Ruins": ["CP1", "Not yet written"], Unlisted: ["X"] })], { ledger: {}, from: {} }, deps);
    expect(calls).toEqual([["Sun Ruins", ["CP1"]]]);
    expect(outcome.ledger).toEqual({ "Sun Ruins": ["CP1"] });
    expect(outcome.skippedBooks).toEqual(["Unlisted"]);
  });

  it("a refused or unconfirmed write is not recorded as normalised, so the next run retries it", async () => {
    const { deps } = host();
    const refused = await normalizeGatedEntries([story({ "Sun Ruins": ["CP1"] })], { ledger: {}, from: {} }, { ...deps, disable: async () => couldNot("the server still holds the old flag") });
    expect(refused.refused).toEqual(["the server still holds the old flag"]);
    expect(refused.ledger).toEqual({});
    expect(refused.from).toEqual({});
    const blind = await normalizeGatedEntries([story({ "Sun Ruins": ["CP1"] })], { ledger: {}, from: {} }, { ...deps, disable: async () => wrote({ changed: true, confirmed: false }) });
    expect(blind.ledger).toEqual({});
  });

  it("stops before a write once its run has lapsed", async () => {
    const { calls, deps } = host();
    let owned = true;
    const ownership: RunOwnership = { mint: () => ({}) as never, check: () => (owned ? { ok: true } : { ok: false, reason: "chat" }) as never };
    const read = deps.read;
    const outcome = await normalizeGatedEntries([story({ "Sun Ruins": ["CP1"] })], { ledger: {}, from: {} }, { ...deps, ownership, read: async (book) => { owned = false; return read(book); } });
    expect(calls).toEqual([]);
    expect(outcome.lapsed).toBe(true);
    expect(outcome.ledger).toEqual({});
  });

  it("control: an owned run writes", async () => {
    const { calls, deps } = host();
    await normalizeGatedEntries([story({ "Sun Ruins": ["CP1"] })], { ledger: {}, from: {} }, deps);
    expect(calls).toEqual([["Sun Ruins", ["CP1"]]]);
  });
});

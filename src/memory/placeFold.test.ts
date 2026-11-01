import { applyLedgerSignals, ledgerKey } from "./ledger";
import { foldLedgerSignals, nameIndexOf, type NameSource } from "./nameFold";
import type { ParsedLedgerSignal } from "./types";

const story: NameSource = {
  roster: [{ id: "mira", name: "Mira" }, { id: "tobin", name: "Tobin" }],
  codex: {
    people: [{ member: "mira", name: "Mira" }, { name: "Abbot Corwen", aliases: ["the abbot"] }],
    places: [{ name: "Old Mill", location: "mill", aliases: ["the mill house"] }, { name: "Lantern Inn", location: "inn" }],
  },
  requirements: { place_lore: { inn: { entry: "The Lantern" }, quarry: { entry: "Grey Quarry" } } },
  scene_read: { locations: ["North Bridge"] },
  factions: [{ name: "River Guild" }, { name: "Mill House" }],
};

const read = (entity: string, entityType: string, value: string): ParsedLedgerSignal => ({ entity, entityType, field: "state", value });

const READS: ParsedLedgerSignal[] = [
  read("the old mill", "place", "burned"), read("Old Mill", "location", "rebuilt"), read("OLD MILL", "place", "busy"), read("mill", "place", "quiet"),
  read("the Lantern Inn", "place", "full"), read("lantern inn", "building", "loud"), read("The Lantern", "place", "shut"),
  read("north bridge", "place", "flooded"), read("the North Bridge", "place", "open"),
  read("river guild", "faction", "angry"), read("The River Guild", "group", "calm"),
  read("the abbot", "person", "gone"),
  read("the mill house", "place", "empty"),
  read("Smugglers' Cove", "place", "dark"), read("smugglers' cove", "place", "lit"),
];

const keys = (signals: readonly ParsedLedgerSignal[]) => new Set(signals.filter((signal) => signal.entityType !== "person").map((signal) => ledgerKey(signal.entity, signal.field)));

describe("v3.0 41 A4: exact name fold for places, groups and things (memory.placeFold)", () => {
  it("floor (declared before the run): every spelling of an authored place, group or lore pin folds to one ledger key; unauthored names stay as written", () => {
    const before = keys(foldLedgerSignals(nameIndexOf(story), READS));
    const folded = foldLedgerSignals(nameIndexOf(story, true), READS);
    const after = keys(folded);
    process.stdout.write(`${JSON.stringify({ distinctKeysBefore: before.size, distinctKeysAfter: after.size })}\n`);
    expect([before.size, after.size]).toEqual([12, 6]);
    expect([...after].sort()).toEqual(["lantern inn|state", "north bridge|state", "old mill|state", "river guild|state", "smugglers' cove|state", "the mill house|state"]);
    expect(folded.filter((signal) => /smugglers/i.test(signal.entity)).map((signal) => signal.entity)).toEqual(["Smugglers' Cove", "smugglers' cove"]);
  });

  it("an alias two story names share stays as written, and a character type still folds only among the cast", () => {
    const folded = foldLedgerSignals(nameIndexOf(story, true), [read("the mill house", "place", "x"), read("mira", "character", "y"), read("Abbot Corwen", "character", "z")]);
    expect(folded.map((signal) => signal.entity)).toEqual(["the mill house", "Mira", "Abbot Corwen"]);
  });

  it("the folded rows land as one versioned ledger entry", () => {
    const applied = applyLedgerSignals([], foldLedgerSignals(nameIndexOf(story, true), [read("the old mill", "place", "burned"), read("Old Mill", "place", "rebuilt")]), new Set(), { boundary: 1, messageId: 3 });
    expect(new Set(applied.map((row) => ledgerKey(row.entity, row.field))).size).toBe(1);
    expect(applied.map((row) => row.entity)).toEqual(["Old Mill", "Old Mill"]);
  });

  it("switch off: the index carries no entities and non-character names are untouched", () => {
    expect(nameIndexOf(story).entities).toBeUndefined();
    expect(foldLedgerSignals(nameIndexOf(story), [read("the old mill", "place", "burned")])[0].entity).toBe("the old mill");
  });
});

import {
  applyLedgerSignals,
  buildBoundKeySet,
  buildLedgerView,
  capLedger,
  LEDGER_ROW_CAP,
  ledgerKey,
  removeLedger,
  renderLedgerBlock,
  rollbackLedger,
  setLedgerPinned,
  type LedgerBinding,
} from "./ledger";
import { parseLedgerLine } from "./parse";
import type { LedgerEntry, ParsedLedgerSignal } from "./types";

const ctx = (boundary: number, messageId?: number) => ({ boundary, messageId });

describe("parseLedgerLine", () => {
  it("parses a state line into per-field signals (Smart-Memory case)", () => {
    expect(parseLedgerLine("[state:Kael:character] location=dungeon | injuries=graze on left shoulder | carried_items=silver key")).toEqual([
      { entity: "Kael", entityType: "character", field: "location", value: "dungeon" },
      { entity: "Kael", entityType: "character", field: "injuries", value: "graze on left shoulder" },
      { entity: "Kael", entityType: "character", field: "carried_items", value: "silver key" },
    ]);
  });

  it("filters noise placeholder values", () => {
    expect(parseLedgerLine("[state:Kael:character] location=unknown | mood=grim")).toEqual([
      { entity: "Kael", entityType: "character", field: "mood", value: "grim" },
    ]);
  });

  it("returns nothing for non-state lines", () => {
    expect(parseLedgerLine("NONE")).toEqual([]);
    expect(parseLedgerLine("[knows] Kael | fact")).toEqual([]);
  });
});

describe("applyLedgerSignals", () => {
  const sig = (entity: string, field: string, value: string, entityType = "character"): ParsedLedgerSignal => ({ entity, field, value, entityType });
  const noBound = new Set<string>();

  it("appends new fields", () => {
    const result = applyLedgerSignals([], [sig("Kael", "location", "dungeon")], noBound, ctx(1, 5));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ entity: "Kael", field: "location", value: "dungeon", messageId: 5 });
  });

  // v2.3 plan 04 (M3): same entity+field is append-only — the change is a new VERSION, and the
  // newest one wins where the ledger is READ. An in-place overwrite destroys the value a rollback
  // has to restore, which is exactly what M3 recorded.
  it("keeps a version per change and reads the newest", () => {
    const first = applyLedgerSignals([], [sig("Kael", "location", "dungeon")], noBound, ctx(1));
    const second = applyLedgerSignals(first, [sig("kael", "location", "courtyard")], noBound, ctx(2));
    const versions = second.filter((entry) => entry.field === "location");
    expect(versions).toHaveLength(2);
    expect(versions.at(-1)).toMatchObject({ value: "courtyard", supersedes: first[0].id });
    expect(versions[0].value).toBe("dungeon");
    expect(buildLedgerView(second, [], {}, {}).map((row) => row.value)).toEqual(["courtyard"]);
  });

  it("a rollback restores the prior value instead of dropping the row", () => {
    const first = applyLedgerSignals([], [sig("Kael", "location", "dungeon")], noBound, ctx(1, 1));
    const second = applyLedgerSignals(first, [sig("kael", "location", "courtyard")], noBound, ctx(2, 2));
    const rolled = rollbackLedger(second, 2);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].value).toBe("dungeon");
    expect(buildLedgerView(rolled, [], {}, {}).map((row) => row.value)).toEqual(["dungeon"]);
  });

  it("drops signals for bound entity|field (single writer)", () => {
    const bound = buildBoundKeySet([{ entity: "Kael", field: "location", qualityKey: "kael_location" }]);
    const result = applyLedgerSignals([], [sig("Kael", "location", "dungeon"), sig("Kael", "mood", "grim")], bound, ctx(1));
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("mood");
  });
});

describe("buildLedgerView", () => {
  const bindings: LedgerBinding[] = [{ entity: "Kael", field: "location", qualityKey: "kael_location" }];
  const entries = [
    { id: "a", entity: "Kael", entityType: "character", field: "mood", value: "grim", createdAt: 3 },
  ] as LedgerEntry[];

  it("mirrors bound fields from the blackboard and merges unbound entries", () => {
    const view = buildLedgerView(entries, bindings, { kael_location: "courtyard" }, { kael_location: 4 });
    expect(view).toContainEqual({ entity: "Kael", field: "location", value: "courtyard", bound: true, turn: 4 });
    expect(view).toContainEqual({ entity: "Kael", field: "mood", value: "grim", bound: false, turn: 3 });
  });

  it("omits bound rows with no blackboard value and never double-counts a shadowed entry", () => {
    const shadowed = [{ id: "b", entity: "Kael", entityType: "character", field: "location", value: "stale", createdAt: 1 }] as LedgerEntry[];
    const view = buildLedgerView(shadowed, bindings, {}, {});
    expect(view).toHaveLength(0);
  });
});

describe("ledger rendering + maintenance", () => {
  const sig = (entity: string, field: string, value: string, entityType = "character"): ParsedLedgerSignal => ({ entity, field, value, entityType });
  const noBound = new Set<string>();

  it("renders grouped by entity and empty for no rows", () => {
    expect(renderLedgerBlock([])).toBe("");
    const block = renderLedgerBlock([
      { entity: "Kael", field: "location", value: "dungeon", bound: true, turn: 1 },
      { entity: "Kael", field: "mood", value: "grim", bound: false, turn: 1 },
    ]);
    expect(block).toContain("Kael: location=dungeon | mood=grim");
  });

  it("V9: repeating an unchanged value adds no version", () => {
    let entries = applyLedgerSignals([], [sig("Kael", "location", "dungeon")], noBound, ctx(1, 1));
    for (let turn = 2; turn < 30; turn += 1) entries = applyLedgerSignals(entries, [sig("Kael", "location", "dungeon")], noBound, ctx(turn, turn));
    expect(entries).toHaveLength(1);
  });

  it("V9: one noisy key never evicts another entity's only row", () => {
    let entries = applyLedgerSignals([], [sig("Mira", "mood", "calm")], noBound, ctx(1, 1));
    for (let turn = 2; turn < 400; turn += 1) entries = capLedger(applyLedgerSignals(entries, [sig("Kael", "hp", String(turn))], noBound, ctx(turn, turn)));
    expect(buildLedgerView(entries, [], {}, {}).map((row) => `${row.entity}.${row.field}=${row.value}`)).toEqual(expect.arrayContaining(["Mira.mood=calm", "Kael.hp=399"]));
    expect(entries.length).toBeLessThanOrEqual(LEDGER_ROW_CAP);
  });

  it("V9: past the key cap the least recently touched unpinned key goes, never a pinned one", () => {
    let entries = applyLedgerSignals([], [sig("Old", "f", "v")], noBound, ctx(1, 1));
    entries = setLedgerPinned(entries, entries[0].id, true);
    entries = applyLedgerSignals(entries, [sig("Stale", "f", "v")], noBound, ctx(2, 2));
    for (let index = 0; index < 5; index += 1) entries = applyLedgerSignals(entries, [sig(`E${index}`, "f", "v")], noBound, ctx(3 + index, 3 + index));
    const kept = capLedger(entries, 4).map((entry) => entry.entity);
    expect(kept).toContain("Old");
    expect(kept).not.toContain("Stale");
    expect(new Set(kept).size).toBe(4);
  });

  it("rolls back at/after a message id, keeps pinned, caps and removes", () => {
    const entries = applyLedgerSignals([], [{ entity: "Kael", field: "location", value: "dungeon", entityType: "character" }], new Set(), ctx(1, 10));
    expect(rollbackLedger(entries, 10)).toHaveLength(0);
    const pinnedRolled = rollbackLedger(setLedgerPinned(entries, entries[0].id, true), 10);
    expect(pinnedRolled).toHaveLength(1);
    expect(pinnedRolled[0].provenance?.validity).toBe("source-removed");
    expect(buildLedgerView(pinnedRolled, [], {}, {})).toEqual([]);
    expect(removeLedger(entries, entries[0].id)).toHaveLength(0);
    expect(ledgerKey("Kael", "Location")).toBe("kael|location");
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, entity: `E${i}`, entityType: "character", field: "f", value: "v", createdAt: i })) as LedgerEntry[];
    expect(capLedger(many, 3)).toHaveLength(3);
  });
});

describe("V11: trimming prefers what a rollback can no longer reach", () => {
  const row = (id: string, entity: string, value: string, messageId: number): LedgerEntry => ({ id, entity, entityType: "character", field: "location", value, messageId, boundary: messageId, createdAt: messageId } as unknown as LedgerEntry);
  // A@1 is A's value AT the floor (its only version below it), so a rollback to the floor restores
  // it; B@2 is older than B's at-floor version B@3, so nothing can ever restore it.
  const entries = [row("a1", "A", "gate", 1), row("b2", "B", "road", 2), row("b3", "B", "inn", 3), row("a8", "A", "hall", 8), row("b9", "B", "keep", 9)];

  it("with a floor, the unreachable version goes and the at-floor version stays", () => {
    expect(capLedger(entries, 60, 4, 5).map((entry) => entry.id)).toEqual(["a1", "b3", "a8", "b9"]);
  });

  it("control: without a floor the oldest version goes, as before", () => {
    expect(capLedger(entries, 60, 4).map((entry) => entry.id)).toEqual(["b2", "b3", "a8", "b9"]);
  });
});

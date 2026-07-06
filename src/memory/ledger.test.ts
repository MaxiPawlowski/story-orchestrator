import {
  applyLedgerSignals,
  buildBoundKeySet,
  buildLedgerView,
  capLedger,
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

  it("merges same entity+field newest-wins", () => {
    const first = applyLedgerSignals([], [sig("Kael", "location", "dungeon")], noBound, ctx(1));
    const second = applyLedgerSignals(first, [sig("kael", "location", "courtyard")], noBound, ctx(2));
    expect(second).toHaveLength(1);
    expect(second[0].value).toBe("courtyard");
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
  const entries: LedgerEntry[] = [
    { id: "a", entity: "Kael", entityType: "character", field: "mood", value: "grim", createdAt: 3 },
  ];

  it("mirrors bound fields from the blackboard and merges unbound entries", () => {
    const view = buildLedgerView(entries, bindings, { kael_location: "courtyard" }, { kael_location: 4 });
    expect(view).toContainEqual({ entity: "Kael", field: "location", value: "courtyard", bound: true, turn: 4 });
    expect(view).toContainEqual({ entity: "Kael", field: "mood", value: "grim", bound: false, turn: 3 });
  });

  it("omits bound rows with no blackboard value and never double-counts a shadowed entry", () => {
    const shadowed: LedgerEntry[] = [{ id: "b", entity: "Kael", entityType: "character", field: "location", value: "stale", createdAt: 1 }];
    const view = buildLedgerView(shadowed, bindings, {}, {});
    expect(view).toHaveLength(0);
  });
});

describe("ledger rendering + maintenance", () => {
  it("renders grouped by entity and empty for no rows", () => {
    expect(renderLedgerBlock([])).toBe("");
    const block = renderLedgerBlock([
      { entity: "Kael", field: "location", value: "dungeon", bound: true, turn: 1 },
      { entity: "Kael", field: "mood", value: "grim", bound: false, turn: 1 },
    ]);
    expect(block).toContain("Kael: location=dungeon | mood=grim");
  });

  it("rolls back at/after a message id, keeps pinned, caps and removes", () => {
    const entries = applyLedgerSignals([], [{ entity: "Kael", field: "location", value: "dungeon", entityType: "character" }], new Set(), ctx(1, 10));
    expect(rollbackLedger(entries, 10)).toHaveLength(0);
    expect(rollbackLedger(setLedgerPinned(entries, entries[0].id, true), 10)).toHaveLength(1);
    expect(removeLedger(entries, entries[0].id)).toHaveLength(0);
    expect(ledgerKey("Kael", "Location")).toBe("kael|location");
    const many: LedgerEntry[] = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, entity: `E${i}`, entityType: "character", field: "f", value: "v", createdAt: i }));
    expect(capLedger(many, 3)).toHaveLength(3);
  });
});

import { applyLedgerSignals, buildLedgerView, renderLedgerBlock, rollbackLedger } from "./ledger";
import { detectConflicts, liveLedgerRows } from "./conflicts";
import { buildNameIndex, foldLedgerSignals } from "./nameFold";
import { parseRelationLine } from "./parse";
import { relationConflicts } from "./relations";
import type { LedgerEntry, ParsedLedgerSignal } from "./types";

const rel = (line: string): ParsedLedgerSignal => {
  const signal = parseRelationLine(line);
  if (!signal) throw new Error(`not a relation line: ${line}`);
  return signal;
};

const apply = (entries: LedgerEntry[], lines: string[], messageId: number) => applyLedgerSignals(entries, lines.map(rel), new Set(), { boundary: messageId, messageId });

describe("v3.0 43 M3: relation rows with several values", () => {
  test("F-M3a: one subject holds a relation to several objects; an ending is a new version hidden from Current state", () => {
    let ledger = apply([], ["[rel:Mira:ally_of] Tobin", "[rel:Mira:ally_of] Esk", "[rel:Mira:ally_of] Wren"], 1);
    expect(ledger).toHaveLength(3);
    ledger = apply(ledger, ["[rel:Mira:ally_of] Tobin"], 2);
    expect(ledger).toHaveLength(3);
    ledger = apply(ledger, ["[rel-end:Mira:ally_of] Esk"], 3);
    ledger = [...ledger, ...applyLedgerSignals([], [{ entity: "Mira", entityType: "character", field: "location", value: "mill" }], new Set(), { boundary: 3, messageId: 3 })];
    expect(ledger.filter((row) => row.relation === "ally_of")).toHaveLength(4);
    expect(ledger.find((row) => row.object === "Esk" && row.value === "ended")?.supersedes).toBeDefined();
    const block = renderLedgerBlock(buildLedgerView(ledger, [], {}, {}));
    expect(block).toBe("Current state:\nMira: ally of Tobin | ally of Wren | location=mill");
    expect(rollbackLedger(ledger, 3).filter((row) => row.value === "ended")).toEqual([]);
  });

  test("F-M3a: names fold to the cast on both ends", () => {
    const index = buildNameIndex({ roster: [{ id: "mira", name: "Mira Vell", aliases: ["the healer"] }, { id: "tobin", name: "Tobin" }] });
    const folded = foldLedgerSignals(index, [rel("[rel:The Healer:serves] tobin"), rel("[rel:Mira:owes] Esk")]);
    expect(folded.map((signal) => [signal.entity, signal.object])).toEqual([["Mira Vell", "Tobin"], ["Mira Vell", "Esk"]]);
  });

  test("F-M3b: opposite relations conflict directly and mirrored for symmetric ones; others never", () => {
    const ledger = apply([], [
      "[rel:Mira:trusts] Tobin", "[rel:Mira:distrusts] Tobin",
      "[rel:Esk:ally_of] Wren", "[rel:Wren:enemy_of] Esk",
      "[rel:Tobin:trusts] Esk", "[rel:Esk:distrusts] Tobin",
      "[rel:Mira:serves] Wren", "[rel:Mira:owes] Wren",
      "[rel:Ada:loves] Bo", "[rel-end:Ada:loves] Bo", "[rel:Ada:hates] Bo",
    ], 1);
    const pairs = relationConflicts(liveLedgerRows(ledger)).map((pair) => pair.rows.map((row) => `${row.entity}>${row.relation}>${row.object}`).join(" vs "));
    expect(pairs).toEqual(["Mira>trusts>Tobin vs Mira>distrusts>Tobin", "Esk>ally_of>Wren vs Wren>enemy_of>Esk"]);
    const queued = detectConflicts([], ledger, {}, [], [], "t");
    expect(queued.map((pair) => pair.sides.map((side) => side.label))).toEqual([
      ["Mira trusts Tobin", "Mira distrusts Tobin"], ["Esk ally of Wren", "Wren enemy of Esk"],
    ]);
    expect(detectConflicts([], ledger, {}, queued.map((pair) => pair.key), [], "t")).toEqual([]);
  });
});

import type { GateNode } from "@engine/index";
import { replayGate, type ReplayEdge, type ReplayHistory, type ReplayLogEntry } from "./gateReplay";

const entry = (boundary: number, at: string, evaluated: Record<string, string | number | boolean> | null, fired: { from: string; to: string } | null = null, source: "gate" | "manual" = "gate"): ReplayLogEntry => ({
  boundary,
  before: { activeCheckpointId: at },
  fired,
  source,
  context: { lastMessageId: boundary * 2 },
  evaluated,
});

const history = (...log: ReplayLogEntry[]): ReplayHistory => ({ from: { boundary: 0, messageId: -1 }, log });

const edge = (gate: GateNode, extra: Partial<ReplayEdge> = {}): ReplayEdge => ({ from: "a", to: "b", gate, priority: 0, order: 0, ...extra });

const declared = new Set(["coins", "found", "progress_toward_b"]);

describe("v2.5 plan 07 A3: replayGate over a chat's recorded history", () => {
  it("an unchanged gate reproduces the recorded fire", () => {
    const gate: GateNode = { q: "coins", op: ">=", v: 3 };
    const result = replayGate({ edge: edge(gate), siblings: [edge(gate)], history: history(
      entry(1, "a", { coins: 1 }),
      entry(2, "a", { coins: 3 }, { from: "a", to: "b" }),
      entry(3, "b", { coins: 3 }),
    ), declared });
    expect(result.firstHold?.boundary).toBe(2);
    expect(result.recordedFire?.boundary).toBe(2);
    expect(result.divergesAt).toBeNull();
    expect(result.rows.map((row) => row.atSource)).toEqual([true, true, false]);
  });

  it("an edited threshold would first hold earlier, and the counterfactual ends there", () => {
    const result = replayGate({ edge: edge({ q: "coins", op: ">=", v: 1 }), siblings: [edge({ q: "coins", op: ">=", v: 1 })], history: history(
      entry(1, "a", { coins: 1 }),
      entry(2, "a", { coins: 3 }, { from: "a", to: "b" }),
    ), declared });
    expect(result.firstHold?.boundary).toBe(1);
    expect(result.recordedFire?.boundary).toBe(2);
    expect(result.divergesAt).toBe(1);
    expect(result.rows[1].afterDivergence).toBe(true);
  });

  it("an edited gate that never holds diverges at the recorded fire and reports no hold", () => {
    const gate: GateNode = { q: "coins", op: ">=", v: 9 };
    const result = replayGate({ edge: edge(gate), siblings: [edge(gate)], history: history(
      entry(1, "a", { coins: 1 }),
      entry(2, "a", { coins: 3 }, { from: "a", to: "b" }),
    ), declared });
    expect(result.firstHold).toBeNull();
    expect(result.divergesAt).toBe(2);
  });

  it("reads the pre-effect value: a gate over progress_toward_<anchor> sees the blackboard before the fired transition's progress", () => {
    const gate: GateNode = { not: { q: "progress_toward_b", op: ">=", v: 1 } };
    const logged: ReplayLogEntry = { ...entry(1, "a", { found: true }, { from: "a", to: "b" }), after: { blackboard: { values: { found: true, progress_toward_b: 1 } } } } as ReplayLogEntry;
    const result = replayGate({ edge: edge(gate), siblings: [edge(gate)], history: history(logged), declared });
    expect(result.rows[0].holds).toBe(true);
    expect(result.divergesAt).toBeNull();
  });

  it("a declared quality with no recorded value is evaluated as the engine does: an unset leaf is false, so not() over it holds", () => {
    const result = replayGate({ edge: edge({ not: { q: "found", op: "==", v: true } }), siblings: [], history: history(entry(1, "a", {})), declared });
    expect(result.rows[0].holds).toBe(true);
    const plain = replayGate({ edge: edge({ q: "found", op: "==", v: true }), siblings: [], history: history(entry(1, "a", {})), declared });
    expect(plain.rows[0].holds).toBe(false);
  });

  it("a leaf naming a quality the pinned story does not declare is unknown, never false", () => {
    const result = replayGate({ edge: edge({ any: [{ q: "coins", op: ">=", v: 9 }, { q: "brand_new", op: "==", v: true }] }), siblings: [], history: history(entry(1, "a", { coins: 1 })), declared });
    expect(result.rows[0].holds).toBe("unknown");
    expect(result.rows[0].wouldFire).toBe("unknown");
    expect(result.firstHold).toBeNull();
    expect(result.unknownQualities).toEqual(["brand_new"]);
  });

  it("a manual activation evaluated no gate: its row has no holds, and it ends the counterfactual", () => {
    const gate: GateNode = { q: "coins", op: ">=", v: 3 };
    const result = replayGate({ edge: edge(gate), siblings: [edge(gate)], history: history(
      entry(1, "a", { coins: 1 }),
      entry(2, "a", null, null, "manual"),
      entry(3, "a", { coins: 5 }, { from: "a", to: "b" }),
    ), declared });
    expect(result.rows[1]).toMatchObject({ manual: true, holds: null, wouldFire: null });
    expect(result.manualAt).toBe(2);
    expect(result.firstHold).toBeNull();
    expect(result.rows[2].afterDivergence).toBe(true);
  });

  it("applies priority among the source's edges: a higher-priority sibling that holds takes the boundary", () => {
    const mine = edge({ q: "coins", op: ">=", v: 1 }, { to: "b", priority: 0, order: 1 });
    const theirs = edge({ q: "found", op: "==", v: true }, { to: "c", priority: 5, order: 0 });
    const result = replayGate({ edge: mine, siblings: [theirs, mine], history: history(
      entry(1, "a", { coins: 1, found: true }, { from: "a", to: "c" }),
    ), declared });
    expect(result.rows[0].holds).toBe(true);
    expect(result.rows[0].wouldFire).toBe(false);
    expect(result.divergesAt).toBeNull();
  });

  it("breaks a priority tie by declaration order", () => {
    const first = edge({ q: "coins", op: ">=", v: 1 }, { to: "b", priority: 1, order: 0 });
    const second = edge({ q: "coins", op: ">=", v: 1 }, { to: "c", priority: 1, order: 1 });
    const result = replayGate({ edge: second, siblings: [second, first], history: history(entry(1, "a", { coins: 1 }, { from: "a", to: "b" })), declared });
    expect(result.rows[0].wouldFire).toBe(false);
  });

  it("only the retained window: boundaries at or below history.from are not replayed", () => {
    const result = replayGate({ edge: edge({ q: "coins", op: ">=", v: 1 }), siblings: [], history: { from: { boundary: 5, messageId: 9 }, log: [entry(5, "a", { coins: 1 }), entry(6, "a", { coins: 1 })] }, declared });
    expect(result.rows.map((row) => row.boundary)).toEqual([6]);
    expect(result.window).toEqual({ fromBoundary: 5, boundaries: 1 });
  });
});

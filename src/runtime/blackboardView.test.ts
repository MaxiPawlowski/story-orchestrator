import { blackboardRows } from "./blackboardView";

describe("T5-5-1: the Blackboard tab lists the gate qualities and the pending writes (shots/001, shots/011)", () => {
  it("at the council: war_turn is set, the gate qualities are listed unset, and the pending commission shows its target value", () => {
    const rows = blackboardRows({
      blackboard: { war_turn: 2 },
      gateQualities: ["war_commission_taken", "war_commission_refused", "war_turn"],
      pendingDeltas: [{ quality: "war_commission_taken", value: true, source: "extractor" }],
    });
    expect(rows).toEqual([
      { key: "war_turn", set: true, value: 2, gate: true, pending: null },
      { key: "war_commission_taken", set: false, value: null, gate: true, pending: { value: true } },
      { key: "war_commission_refused", set: false, value: null, gate: true, pending: null },
    ]);
  });

  it("a pending write to a key no gate reads is listed too; nothing at all leaves the tab empty", () => {
    expect(blackboardRows({ blackboard: {}, gateQualities: [], pendingDeltas: [{ quality: "location", value: "war_throne_room", source: "extractor" }] }))
      .toEqual([{ key: "location", set: false, value: null, gate: false, pending: { value: "war_throne_room" } }]);
    expect(blackboardRows({ blackboard: {}, gateQualities: [], pendingDeltas: [] })).toEqual([]);
  });
});

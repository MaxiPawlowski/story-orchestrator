import type { BoundaryLogEntry, GateNode, PrimitiveValue } from "@engine/index";
import { playerTurnsGate } from "@generation/living/plan";
import { LIVING_PACE_TURNS, LIVING_STUB_TURNS } from "@generation/living/types";
import { heldLeaf, railroadView } from "./railroadView";

const lead: GateNode = { q: "liv_1_lantern_failed", op: "==", v: true };
const wayIn: GateNode = { any: [lead, playerTurnsGate(LIVING_PACE_TURNS)] };
const arrive: GateNode = { any: [{ q: "progress_toward_liv_1", op: ">=", v: 1 }, lead, playerTurnsGate(LIVING_STUB_TURNS)] };

let boundary = 0;
const entry = (at: string, values: Record<string, PrimitiveValue>, fired: { from: string; to: string; gate: GateNode } | null, player?: number): BoundaryLogEntry => {
  boundary += 1;
  const state = { activeCheckpointId: at, blackboard: { values } } as unknown as BoundaryLogEntry["before"];
  return {
    at: 0, boundary, before: state, after: state, source: "gate", evaluated: values, queue: { applied: [], discarded: [] },
    context: { lastMessageId: boundary * 2, chatLength: boundary * 2 + 1, ...(player === undefined ? {} : { lastPlayerMessageId: player }) },
    fired: fired ? { ...fired, priority: 1, declarationIndex: 0 } : null,
  };
};

describe("v3.0 42a F4: railroad readout", () => {
  it("names the leaf that held: what happened in play, or only the turn count", () => {
    expect(heldLeaf(wayIn, { liv_1_lantern_failed: true, player_turns_in_checkpoint: 5 })).toBe("lead");
    expect(heldLeaf(wayIn, { liv_1_lantern_failed: false, player_turns_in_checkpoint: 3 })).toBe("pace");
    expect(heldLeaf(arrive, { progress_toward_liv_1: 1, player_turns_in_checkpoint: 1 })).toBe("lead");
    expect(heldLeaf(lead, { liv_1_lantern_failed: true })).toBe("lead");
  });

  it("counts the pace-forced share of way-ins (a stub's arrival is a bridge, not counted), quiet runs at living turning points and branches per anchor", () => {
    boundary = 0;
    const log = [
      entry("start", {}, { from: "start", to: "cp2", gate: { q: "x", op: "==", v: true } }),
      entry("liv_open", { player_turns_in_checkpoint: 1 }, null, 3),
      entry("liv_open", { player_turns_in_checkpoint: 2 }, null, 5),
      entry("liv_open", { player_turns_in_checkpoint: 3 }, { from: "liv_open", to: "liv_1_way", gate: wayIn }, 7),
      entry("liv_1_way", { progress_toward_liv_1: 1 }, { from: "liv_1_way", to: "liv_1", gate: arrive }, 7),
      entry("liv_1", { liv_1_lantern_failed: true }, { from: "liv_1", to: "liv_b1_way", gate: { any: [lead, playerTurnsGate(LIVING_PACE_TURNS)] } }, 9),
    ];
    const view = railroadView(log);
    expect(view).toMatchObject({ living: 2, lead: 1, pace: 1, quietRuns: 1, longestQuiet: 2, branches: { liv_1: 1 } });
    expect(view.paceShare).toBeCloseTo(1 / 2);
    expect(view.overFloor).toBe(true);
    expect(railroadView([...log.slice(0, 4), log[5], log[5]]).paceShare).toBeCloseTo(1 / 3);
    expect(railroadView([...log.slice(0, 4), log[5], log[5]]).overFloor).toBe(false);
  });

  it("is derived from the log alone: a rollback that drops entries reproduces the shorter readout", () => {
    boundary = 0;
    const log = [
      entry("liv_open", { player_turns_in_checkpoint: 3 }, { from: "liv_open", to: "liv_1_way", gate: wayIn }, 1),
      entry("liv_1_way", { progress_toward_liv_1: 1 }, { from: "liv_1_way", to: "liv_1", gate: arrive }, 1),
    ];
    expect(railroadView(log.slice(0, 1))).toEqual(railroadView([log[0]]));
    expect(railroadView([]).paceShare).toBeNull();
  });
});

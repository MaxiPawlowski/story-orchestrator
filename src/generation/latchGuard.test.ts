import { parseStoryV2OrThrow, type PrimitiveValue } from "@engine/index";
import { runCodeChecks } from "./critic";
import type { GeneratedBeat, PlannedExpansionInput } from "./types";

jest.mock("@services/STAPI", () => ({
  sendConnectionProfileRequest: jest.fn(async () => "{}"),
}));

const story = parseStoryV2OrThrow({
  format: 2,
  title: "Latch",
  description: "",
  qualities: [{ key: "key_found", type: "bool", source: "extractor", latching: true, rubric: "r" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true },
    { id: "finish", name: "Finish", objective: "", type: "anchor", state_snapshot: { key_found: true } },
  ],
  transitions: [{ from: "start", to: "finish", priority: 0, gate: { all: [{ q: "key_found", op: "==", v: true }] } }],
  roster: [],
});

const beat = (gateValue: boolean): GeneratedBeat => ({
  objective: "o",
  guidance: "g",
  tension_target: "tense",
  outcomes: [{ label: "branch", gate: { all: [{ q: "key_found", op: "==", v: gateValue }] }, deltas: [{ q: "key_found", v: true }], progress: { anchor: "finish", amount: 1 } }],
});

const input = (latched: Record<string, PrimitiveValue>): PlannedExpansionInput => ({
  candidate: { sourceCheckpointId: "start", stubId: "start", targetAnchorId: "finish", transition: story.outgoingByCheckpoint.start[0] },
  beats: 2,
  deltas: [],
  tensionTrajectory: [0, 1],
  generationBias: null,
  canon: "",
  facts: [],
  latched,
});

describe("expansion latched-value guard (F1)", () => {
  it("rejects an outcome gate that contradicts a latched value", () => {
    const result = runCodeChecks(story, input({ key_found: true }), [beat(false), beat(false)]);
    expect(result.issues.some((issue) => /contradicts latched/.test(issue))).toBe(true);
  });

  it("accepts outcome gates consistent with the latched value", () => {
    const result = runCodeChecks(story, input({ key_found: true }), [beat(true), beat(true)]);
    expect(result.issues.some((issue) => /contradicts latched/.test(issue))).toBe(false);
  });
});

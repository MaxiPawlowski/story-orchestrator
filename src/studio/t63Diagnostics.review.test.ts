import type { StoryV2 } from "@engine/index";
import { DIAGNOSTIC_CONSEQUENCES, runDiagnostics } from "./diagnostics";

const kingdom = (patch: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2,
  title: "The Redrawn Kingdom",
  description: "",
  qualities: [
    { key: "suspicion", type: "int", source: "extractor", rubric: "How suspicious are the houses?" },
    { key: "ink", type: "int", source: "extractor", rubric: "How much ink is spent?" },
  ],
  checkpoints: [
    { id: "start", name: "The Workshop", objective: "Begin.", type: "anchor", start: true, effects: { cast_changes: { disable: ["Lady Ysolde", "Lord Casimir", "Envoy Marrow"] } } },
    { id: "house_varn", name: "House Varn", objective: "Meet Varn.", type: "intermediate", effects: { cast_changes: { enable: ["Envoy Marrow"] } } },
    { id: "the_redrawing", name: "The Redrawing", objective: "Choose.", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "house_varn", priority: 1, gate: { q: "suspicion", op: ">=", v: 1 } },
    { from: "house_varn", to: "the_redrawing", priority: 1, gate: { q: "ink", op: ">=", v: 2 } },
  ],
  roster: [{ id: "halden", name: "Master Halden" }, { id: "ysolde", name: "Lady Ysolde" }, { id: "casimir", name: "Lord Casimir" }, { id: "marrow", name: "Envoy Marrow" }],
  ...patch,
});

const codes = (story: StoryV2, code: string) => runDiagnostics(story).filter((diagnostic) => diagnostic.code === code);

describe("T6-3 MEDIUM: a cast member switched off and never switched back on", () => {
  it("names each muted-for-good member at the disable that mutes them", () => {
    const found = codes(kingdom(), "cast-member-never-enabled");
    expect(found.map((diagnostic) => diagnostic.path)).toEqual(["checkpoints.0.effects.cast_changes.disable.0", "checkpoints.0.effects.cast_changes.disable.1"]);
    expect(found[0].message).toContain("'Lady Ysolde'");
    expect(found[0].consequence).toBe(DIAGNOSTIC_CONSEQUENCES["cast-member-never-enabled"]);
  });

  it("accepts an enable by roster id, and says nothing when every disabled member comes back", () => {
    const story = kingdom();
    story.checkpoints[1] = { ...story.checkpoints[1], effects: { cast_changes: { enable: ["Envoy Marrow", "ysolde", "Lord Casimir"] } } };
    expect(codes(story, "cast-member-never-enabled")).toEqual([]);
  });
});

describe("T6-3 MEDIUM: a way out the start state already satisfies", () => {
  it("flags the start's exit when the start snapshot already meets it", () => {
    const story = kingdom();
    story.checkpoints[0] = { ...story.checkpoints[0], state_snapshot: { suspicion: 1 } };
    const found = codes(story, "gate-open-on-arrival");
    expect(found.map((diagnostic) => diagnostic.path)).toEqual(["transitions.0.gate"]);
    expect(found[0].message).toContain("snapshot");
  });

  it("is silent when the snapshot sits below the exit", () => {
    const story = kingdom();
    story.checkpoints[0] = { ...story.checkpoints[0], state_snapshot: { suspicion: 0 } };
    expect(codes(story, "gate-open-on-arrival")).toEqual([]);
  });
});

describe("T7 J14.1: a talk_control speaker the agent left without a member", () => {
  it("is reported as an unknown member instead of crashing the diagnostics", () => {
    const story = kingdom();
    story.checkpoints[0]!.talk_control = { speakers: [{} as never, { member: "halden" }], lead: "halden" } as never;
    expect(() => runDiagnostics(story)).not.toThrow();
    expect(codes(story, "talk-member-unknown").map((diagnostic) => diagnostic.path)).toEqual(["checkpoints.0.talk_control.speakers.0"]);
  });
});

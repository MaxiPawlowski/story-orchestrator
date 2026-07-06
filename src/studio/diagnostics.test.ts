import type { StoryV2 } from "@engine/index";
import { DIAGNOSTIC_CODES, runDiagnostics } from "./diagnostics";

const clean: StoryV2 = {
  format: 2,
  title: "clean",
  description: "",
  qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "r" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true },
    { id: "cache", name: "Cache", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "cache", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 1 }] } }],
  roster: [],
};

const seeded: StoryV2 = {
  format: 2,
  title: "seeded",
  description: "",
  qualities: [
    { key: "trust", type: "int", source: "extractor", rubric: "r" },
    { key: "route", type: "enum", values: ["stealth", "force"], source: "extractor", rubric: "r" },
    { key: "alarm", type: "bool", source: "extractor", rubric: "r" },
    { key: "secret", type: "string", source: "extractor", rubric: "r", scope_hint: { until: "start" } },
    { key: "morale", type: "int", source: "extractor", latching: true, rubric: "r" },
  ],
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true, state_snapshot: { morale: 1 } },
    { id: "mid", name: "Mid", objective: "", type: "intermediate" },
    { id: "cache", name: "Cache", objective: "", type: "anchor", convergence_threshold: 5 },
    { id: "lost", name: "Lost", objective: "", type: "anchor" },
    { id: "stubby", name: "Stubby", objective: "", type: "intermediate" },
  ],
  scaffolding: { stubby: { beats: [], basis: {} } },
  transitions: [
    { from: "start", to: "mid", priority: 0, gate: { all: [{ q: "ghost", op: "==", v: 1 }] } },
    {
      from: "mid",
      to: "cache",
      priority: 0,
      gate: { all: [{ q: "alarm", op: ">=", v: 1 }, { q: "route", op: "==", v: "teleport" }, { q: "secret", op: "==", v: "x" }, { q: "morale", op: "==", v: 5 }] },
      effects: { progress: { anchor: "cache", amount: 1 } },
    },
    { from: "mid", to: "stubby", priority: 0, gate: { all: [] } },
  ],
  roster: [],
};

describe("runDiagnostics", () => {
  it("reports nothing for a clean story", () => {
    expect(runDiagnostics(clean)).toHaveLength(0);
  });

  it("fires every diagnostic exactly once on the seeded-error story", () => {
    const diagnostics = runDiagnostics(seeded);
    const counts = new Map<string, number>();
    diagnostics.forEach((entry) => counts.set(entry.code, (counts.get(entry.code) ?? 0) + 1));
    DIAGNOSTIC_CODES.forEach((code) => {
      expect(counts.get(code)).toBe(1);
    });
    expect(diagnostics).toHaveLength(DIAGNOSTIC_CODES.length);
  });

  it("warns when an extractor quality appears in no gate or snapshot", () => {
    const story: StoryV2 = {
      ...clean,
      qualities: [...clean.qualities, { key: "orphan", type: "bool", source: "extractor", rubric: "r" }],
    };
    const hits = runDiagnostics(story).filter((entry) => entry.code === "quality-never-in-scope");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("warning");
    expect(hits[0].message).toContain("orphan");
  });

  it("does not warn for code qualities, tension_current, or snapshot-only references", () => {
    const story: StoryV2 = {
      ...clean,
      qualities: [
        ...clean.qualities,
        { key: "counter", type: "int", source: "code", monotonic: true, rubric: "r" },
        { key: "tension_current", type: "float", source: "extractor", rubric: "r" },
        { key: "snapped", type: "bool", source: "extractor", rubric: "r" },
      ],
      checkpoints: clean.checkpoints.map((checkpoint) => checkpoint.id === "cache" ? { ...checkpoint, state_snapshot: { snapped: true } } : checkpoint),
    };
    expect(runDiagnostics(story).filter((entry) => entry.code === "quality-never-in-scope")).toHaveLength(0);
  });
});

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
    { key: "location", type: "string", source: "extractor", rubric: "r" },
    { key: "stance", type: "enum", values: ["friend", "foe"], source: "extractor", rubric: "r", read_as: "choice" },
    { key: "mood", type: "enum", values: ["calm", "angry"], source: "extractor", rubric: "r", latching: true, read_as: "choice", criteria: { angry: { what: "Shouts or strikes", not_for: "Angry words said calmly" } } },
  ],
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true, state_snapshot: { morale: 1, location: "hall" } },
    {
      id: "mid",
      name: "Mid",
      objective: "",
      type: "intermediate",
      talk_control: {
        speakers: [{ member: "ghost-member" }, { member: "The Guide" }],
        lead: "warden",
        allow_silence: true,
      },
    },
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
    { from: "mid", to: "stubby", priority: 0, gate: { all: [{ q: "stance", op: "==", v: "friend" }, { q: "mood", op: "==", v: "calm" }] } },
  ],
  roster: [{ id: "guide", name: "The Guide" }, { id: "warden", name: "The Warden" }],
  lore_select: { lorebooks: ["Unlisted Lore"] },
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

  it("warns that a free-text location quality leaves the scene tracker placeless, unless places are listed (v2.2 plan 03)", () => {
    const freeText: StoryV2 = { ...clean, qualities: [...clean.qualities, { key: "location", type: "string", source: "extractor", rubric: "Where?" }] };
    expect(runDiagnostics(freeText).filter((entry) => entry.code === "scene-read-location-empty")).toEqual([expect.objectContaining({ severity: "warning", path: "qualities.1" })]);
    expect(runDiagnostics({ ...freeText, scene_read: { locations: ["guild hall"] } }).some((entry) => entry.code === "scene-read-location-empty")).toBe(false);
    const enumLocation: StoryV2 = { ...clean, qualities: [...clean.qualities, { key: "location", type: "enum", values: ["hall"], source: "extractor", rubric: "Where?" }] };
    expect(runDiagnostics(enumLocation).some((entry) => entry.code === "scene-read-location-empty")).toBe(false);
  });

  it("warns about a lore-select book the story does not require, case-insensitively (v2.2 plan 04)", () => {
    const story: StoryV2 = { ...clean, requirements: { lorebooks: ["Vault Lore"] }, lore_select: { lorebooks: ["vault lore", "Other Lore"] } };
    expect(runDiagnostics(story).filter((entry) => entry.code === "lore-select-inactive").map((entry) => entry.path)).toEqual(["lore_select.lorebooks.1"]);
  });

  it("notes judge hints: plain single-word options, the latching floor, and a 'not for' that names its own option (v2.2 plan 06)", () => {
    const hinted = (quality: Record<string, unknown>) => runDiagnostics({ ...clean, qualities: [...clean.qualities, { key: "q", type: "enum", values: ["calm", "very angry"], source: "extractor", rubric: "r", ...quality } as never] }).map((entry) => [entry.code, entry.severity]);
    expect(hinted({ read_as: "choice" })).toEqual(expect.not.arrayContaining([["quality-hint-no-criteria", "info"]]));
    expect(runDiagnostics({ ...clean, qualities: [...clean.qualities, { key: "q", type: "enum", values: ["calm", "angry"], source: "extractor", rubric: "r", read_as: "choice" }] }).map((entry) => entry.code)).toContain("quality-hint-no-criteria");
    expect(hinted({ read_as: "choice", latching: true, criteria: { calm: "Quiet" } })).toContainEqual(["quality-hint-latching-note", "info"]);
    expect(hinted({ read_as: "choice", criteria: { "very angry": { what: "Rages", not_for: "Someone very angry but hiding it" } } })).toContainEqual(["quality-criteria-self-exclusion", "warning"]);
    expect(hinted({ read_as: "choice", criteria: { calm: { what: "Quiet", not_for: "Sulking silence" } } }).some(([code]) => code === "quality-criteria-self-exclusion")).toBe(false);
  });
});


import type { StoryV2 } from "@engine/index";
import { DIAGNOSTIC_CODES, DIAGNOSTIC_CONSEQUENCES, runDiagnostics } from "./diagnostics";

describe("diagnostic consequences (v2.3 plan 09)", () => {
  it("gives every code a plain consequence, so a new one cannot ship without one", () => {
    const missing = DIAGNOSTIC_CODES.filter((code) => !DIAGNOSTIC_CONSEQUENCES[code]?.trim());
    expect(missing).toEqual([]);
  });

  it("states the consequence in the story's terms, not the schema's", () => {
    expect(DIAGNOSTIC_CONSEQUENCES["quality-never-in-scope"]).toBe("Nothing can react to this, because the story is never asked about it.");
    // No code names leak into the consequence an author reads.
    expect(Object.values(DIAGNOSTIC_CONSEQUENCES).filter((line) => /_|snapshot|state_snapshot/.test(line))).toEqual([]);
  });
});

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
    { key: "route", type: "enum", values: ["stealth", "force"], source: "extractor", rubric: "r", evidence_from: "any" },
    { key: "alarm", type: "bool", source: "extractor", rubric: "r" },
    { key: "secret", type: "string", source: "extractor", rubric: "r", scope_hint: { until: "start" } },
    { key: "morale", type: "int", source: "extractor", latching: true, rubric: "r" },
    { key: "location", type: "string", source: "extractor", rubric: "r" },
    { key: "stance", type: "enum", values: ["friend", "foe"], source: "extractor", rubric: "r", read_as: "choice" },
    { key: "mood", type: "enum", values: ["calm", "angry"], source: "extractor", rubric: "r", latching: true, read_as: "choice", criteria: { angry: { what: "Shouts or strikes", not_for: "Angry words said calmly" } } },
    { key: "verdict", type: "enum", values: ["guilty", "undecided"], source: "extractor", rubric: "r", latching: true },
    { key: "dread", type: "int", source: "extractor", rubric: "How afraid is she?", read_as: "rating" },
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
      agency: { alternate: "nowhere" },
    },
    { id: "cache", name: "Cache", objective: "", type: "anchor", convergence_threshold: 5 },
    { id: "lost", name: "Lost", objective: "", type: "anchor" },
    { id: "stubby", name: "Stubby", objective: "", type: "intermediate", agency: { alternate: "stubby" } },
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
    { from: "mid", to: "stubby", priority: 0, gate: { all: [{ q: "stance", op: "==", v: "friend" }, { q: "mood", op: "==", v: "calm" }, { q: "verdict", op: "==", v: "guilty" }, { q: "dread", op: ">=", v: 1 }] } },
  ],
  roster: [{ id: "guide", name: "The Guide" }, { id: "warden", name: "The Warden" }],
  lore_select: { lorebooks: ["Unlisted Lore"] },
  house_rules: ["No guns; no swords.", "Magic cannot heal wounds."],
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


describe("latching enums with a placeholder (S1)", () => {
  const withEnums = (values: string[], latching: boolean | undefined): StoryV2 => ({
    ...clean,
    qualities: [{ key: "mood", type: "enum", values, source: "extractor", rubric: "r", ...(latching === undefined ? {} : { latching }) }],
  });

  it("flags each placeholder shape in a latching enum", () => {
    for (const placeholder of ["undecided", "none", "pending", "unset", "tbd"]) {
      const found = runDiagnostics(withEnums(["calm", placeholder], true)).filter((entry) => entry.code === "latching-enum-placeholder");
      expect(found.map((entry) => entry.message)).toHaveLength(1);
      expect(found[0]?.message).toContain(placeholder);
      expect(found[0]?.message).toContain("the unset state is the absence of a value");
    }
  });

  it("says nothing when the enum does not latch", () => {
    expect(runDiagnostics(withEnums(["calm", "none"], false)).filter((entry) => entry.code === "latching-enum-placeholder")).toEqual([]);
  });

  it("says nothing for a latching enum with no placeholder", () => {
    expect(runDiagnostics(withEnums(["calm", "angry"], true)).filter((entry) => entry.code === "latching-enum-placeholder")).toEqual([]);
  });

  it("keeps the diagnostic code list in step with what it emits", () => {
    expect(DIAGNOSTIC_CODES).toContain("latching-enum-placeholder");
  });
});

describe("an outcome a player's line alone can prove (v2.4 plan 04 T15)", () => {
  const story = (quality: Partial<StoryV2["qualities"][number]>, to: "cache" | "start" = "cache"): StoryV2 => ({
    ...clean,
    qualities: [{ key: "idol_taken", type: "bool", source: "extractor", rubric: "Does the player hold the idol?", ...quality } as StoryV2["qualities"][number]],
    transitions: [
      to === "cache"
        ? { from: "start", to: "cache", priority: 0, gate: { all: [{ q: "idol_taken", op: "==", v: true }] } }
        : { from: "cache", to: "start", priority: 0, gate: { q: "idol_taken", op: "==", v: true } },
    ],
  });
  const hits = (draft: StoryV2) => runDiagnostics(draft).filter((entry) => entry.code === "quality-outcome-player-evidence");

  it("suggests world evidence for a bool or enum that gates the way into an anchor, as info", () => {
    expect(hits(story({}))).toEqual([expect.objectContaining({ severity: "info", path: "qualities.0", consequence: "A player's line alone can move the story here: writing that they did it counts as done." })]);
    expect(hits({ ...story({ type: "enum", values: ["held", "left"] } as never), transitions: [{ from: "start", to: "cache", priority: 0, gate: { q: "idol_taken", op: "==", v: "held" } }] })).toHaveLength(1);
  });

  it("is silenced by an explicit choice either way", () => {
    expect(hits(story({ evidence_from: "any" }))).toHaveLength(0);
    expect(hits(story({ evidence_from: "world" }))).toHaveLength(0);
  });

  it("says nothing for a number, a code quality, or a gate into an intermediate", () => {
    expect(hits(story({ type: "int" }))).toHaveLength(0);
    expect(hits(story({ source: "code" }))).toHaveLength(0);
    expect(hits(story({}, "start"))).toHaveLength(0);
  });

  it("reports a quality once however many anchor gates read it", () => {
    const twice: StoryV2 = { ...story({}), checkpoints: [...clean.checkpoints, { id: "vault", name: "Vault", objective: "", type: "anchor" }], transitions: [...story({}).transitions, { from: "start", to: "vault", priority: 0, gate: { not: { q: "idol_taken", op: "==", v: false } } }] };
    expect(hits(twice)).toHaveLength(1);
  });
});

describe("a rating with no readable scale (F1)", () => {
  const withRating = (quality: Partial<StoryV2["qualities"][number]>): StoryV2 => ({
    ...clean,
    qualities: [{ key: "dread", type: "int", source: "extractor", rubric: "How afraid is she?", read_as: "rating", ...quality } as StoryV2["qualities"][number]],
  });

  it("blocks, and carries the shape the repair pass has to produce", () => {
    const found = runDiagnostics(withRating({})).filter((entry) => entry.code === "quality-rating-no-scale");
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe("blocking");
    expect(found[0].message).toContain('from 1 (barely) to 5 (completely)');
  });

  it("says nothing once the rubric states the scale", () => {
    expect(runDiagnostics(withRating({ rubric: "How afraid is she? from 1 (barely) to 5 (completely)" })).filter((entry) => entry.code === "quality-rating-no-scale")).toEqual([]);
  });

  it("says nothing for a rating whose levels are authored", () => {
    expect(runDiagnostics(withRating({ criteria: { levels: [{ value: 1, label: "1: calm" }, { value: 2, label: "2: terrified" }] } })).filter((entry) => entry.code === "quality-rating-no-scale")).toEqual([]);
  });
});

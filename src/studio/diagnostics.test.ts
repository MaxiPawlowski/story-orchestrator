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

describe("agenda pace without chapters (owner decision 2026-10-07)", () => {
  const paceHits = (draft: StoryV2) => runDiagnostics(draft).filter((entry) => entry.code === "agenda-pace-no-chapters");
  const withAgenda = (pace: "per_chapter" | "per_n_boundaries"): StoryV2 => ({
    ...clean, roster: [{ id: "arin", name: "Arin", agenda: [{ id: "plan", goal: "Leave town", pace, steps: [{ text: "packed" }] }] }],
  });
  it("blocks a per_chapter agenda in a story without chapters, consequence first", () => {
    expect(paceHits(withAgenda("per_chapter"))).toEqual([
      expect.objectContaining({ severity: "blocking", path: "roster.0.agenda.0.pace", consequence: DIAGNOSTIC_CONSEQUENCES["agenda-pace-no-chapters"] }),
    ]);
    expect(paceHits(withAgenda("per_chapter"))[0].message).toContain("per_n_boundaries");
  });
  it("passes per_n_boundaries, and per_chapter once the story has chapters", () => {
    expect(paceHits(withAgenda("per_n_boundaries"))).toEqual([]);
    expect(paceHits({ ...withAgenda("per_chapter"), chapters: [{ id: "one", title: "One" }] })).toEqual([]);
  });
});

describe("story kind (2026-10-03)", () => {
  const kindHits = (draft: StoryV2) => runDiagnostics(draft).filter((entry) => entry.code === "story-kind-invalid");
  it("blocks a kind that is neither saga nor story, and passes both and absent", () => {
    expect(kindHits({ ...clean, kind: "epic" } as unknown as StoryV2)).toEqual([
      expect.objectContaining({ severity: "blocking", path: "kind", consequence: DIAGNOSTIC_CONSEQUENCES["story-kind-invalid"] }),
    ]);
    expect(kindHits({ ...clean, kind: "saga" })).toEqual([]);
    expect(kindHits({ ...clean, kind: "story" })).toEqual([]);
    expect(kindHits(clean)).toEqual([]);
  });
});

const installSeeded: StoryV2 = {
  ...clean,
  description: "You are the courier of the guild.",
  checkpoints: [{ ...clean.checkpoints[0], effects: { background: { name: "harbour_night" }, cast_changes: { enable: ["Ghost"] } } }, clean.checkpoints[1]],
  roster: [{ id: "courier", name: "The Courier" }],
};

const arrivalSeeded: StoryV2 = {
  ...clean,
  checkpoints: [{ ...clean.checkpoints[0], effects: { cast_changes: { disable: ["The Warden"] } } }, { id: "road", name: "Road", objective: "", type: "intermediate" }, clean.checkpoints[1]],
  roster: [{ id: "warden", name: "The Warden" }],
  transitions: [
    { from: "start", to: "road", priority: 0, gate: { q: "trust", op: ">=", v: 2 } },
    { from: "road", to: "cache", priority: 0, gate: { q: "trust", op: ">=", v: 1 } },
  ],
  requirements: { personas: ["The Apprentice"] },
};

const seeded: StoryV2 = {
  format: 2,
  title: "seeded",
  description: "",
  kind: "epic" as StoryV2["kind"],
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
    {
      id: "start", name: "Start", objective: "", type: "intermediate", start: true, state_snapshot: { morale: 1, location: "hall" },
      effects: { npc_replies: [{ kind: "scripted", member: "The Guide", trigger: "onEnter", new_chat_only: true, text: "Welcome, {{user}}." }] },
    },
    {
      id: "mid",
      name: "Mid",
      objective: "",
      type: "intermediate",
      talk_control: {
        speakers: [{ member: "ghost-member" }, { member: "The Guide" }],
        lead: "warden",
        allow_silence: true,
        chain: { sequence: ["ghost-member"] },
      },
      agency: { alternate: "nowhere" },
      effects: { author_note: "Hold the line.", world_info: { enable: [{ lorebook: "Ruins", comments: ["Gate"] }] } },
    },
    { id: "cache", name: "Cache", objective: "", type: "anchor", convergence_threshold: 5, guidance: { members: { "ghost-member": "Hide the key." } } },
    { id: "lost", name: "Lost", objective: "", type: "anchor", motives: { guide: "find the gate", nobody: "hide", player: "win" } },
    { id: "stubby", name: "Stubby", objective: "", type: "intermediate", agency: { alternate: "stubby" }, talk_control: { chain: { mode: "scripted" } }, effects: { author_note: null } },
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
  requirements: { members: ["warden"] },
  briefing: { sections: [{ heading: "Ahead", text: "Mind the Cache." }] },
  player: { summary: "You will find the Cache." },
};

const anchor = (id: string, chapter?: string, start = false) => ({ id, name: id, objective: "", type: "anchor" as const, ...(chapter ? { chapter } : {}), ...(start ? { start } : {}) });
const hop = (from: string, to: string) => ({ from, to, priority: 0, gate: { all: [] } });

const chaptered: StoryV2 = {
  ...clean,
  qualities: [],
  chapters: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C", final: true }, { id: "u", title: "Empty", final: true }],
  checkpoints: [anchor("a1", "a", true), anchor("a2", "a"), anchor("b1", "b"), anchor("b2", "b"), anchor("c1", "c"), anchor("m"), anchor("g", "ghost")],
  transitions: [hop("a1", "a2"), hop("a1", "b1"), hop("b1", "b2"), hop("b2", "b1"), hop("a1", "c1"), hop("c1", "a1"), hop("a1", "m"), hop("a1", "g")],
};

describe("runDiagnostics", () => {
  it("reports nothing for a clean story", () => {
    expect(runDiagnostics(clean)).toHaveLength(0);
  });

  it("fires every diagnostic exactly once on the seeded-error story, plus the exclusive lore-select with no book (it cannot share the seeded scope)", () => {
    const diagnostics = [
      ...runDiagnostics(seeded, { worldInfoGating: "scan" }),
      ...runDiagnostics({ ...clean, lore_select: { lorebooks: [], exclusive: true } }),
      ...runDiagnostics(chaptered),
      ...runDiagnostics(installSeeded, { characterNames: () => ["Tobias"], backgroundNames: () => ["tavern day.jpg"] }),
      ...runDiagnostics(arrivalSeeded, { personaNames: () => ["Traveller"] }),
      ...runDiagnostics({ ...clean, roster: [{ id: "arin", name: "Arin", agenda: [{ id: "plan", goal: "Leave", pace: "per_chapter", steps: [{ text: "packed" }] }] }] }),
      ...runDiagnostics({ ...clean, checkpoints: [{ ...clean.checkpoints[0], effects: { stage: { cast: { Arin: { face: "angry" } } } } as StoryV2["checkpoints"][number]["effects"] }, clean.checkpoints[1]] },
        { spriteInventory: () => ({ arin: { sets: ["default"], faces: ["neutral"] } }) }),
    ];
    const counts = new Map<string, number>();
    diagnostics.forEach((entry) => counts.set(entry.code, (counts.get(entry.code) ?? 0) + 1));
    DIAGNOSTIC_CODES.forEach((code) => {
      expect(counts.get(code)).toBe(1);
    });
    expect(diagnostics).toHaveLength(DIAGNOSTIC_CODES.length);
  });

  describe("checkpoint-inherits-author-note (v2.4 plan 06 T16b)", () => {
    const chain = (patch: Partial<StoryV2> = {}, notes: Record<string, unknown> = { start: "Keep the hall hushed." }): StoryV2 => ({
      ...clean,
      checkpoints: [
        { id: "start", name: "Hall", objective: "", type: "intermediate", start: true },
        { id: "road", name: "Road", objective: "", type: "intermediate" },
        { id: "cache", name: "Cache", objective: "", type: "anchor" },
      ].map((checkpoint) => (notes[checkpoint.id] === undefined ? checkpoint : { ...checkpoint, effects: { author_note: notes[checkpoint.id] } })) as StoryV2["checkpoints"],
      transitions: [
        { from: "start", to: "road", priority: 0, gate: { q: "trust", op: ">=", v: 1 } },
        { from: "road", to: "cache", priority: 0, gate: { q: "trust", op: ">=", v: 2 } },
      ],
      ...patch,
    });
    const hits = (story: StoryV2) => runDiagnostics(story).filter((entry) => entry.code === "checkpoint-inherits-author-note");

    it("names the checkpoint whose note a later one plays under, through inheriting ones, and says the objective line is added", () => {
      expect(hits(chain()).map((entry) => [entry.path, entry.severity, entry.message])).toEqual([
        ["checkpoints.1.effects.author_note", "info", "'road' plays under the note of \"Hall\"; the objective line is added"],
        ["checkpoints.2.effects.author_note", "info", "'cache' plays under the note of \"Hall\"; the objective line is added"],
      ]);
    });

    it("says the objective line is not added when the story switched it off", () => {
      expect(hits(chain({ objective_block: "off" }))[0].message).toContain("the objective line is not added");
    });

    it("stops at a checkpoint that clears the note, and is silent where every checkpoint authors one", () => {
      expect(hits(chain({}, { start: "Keep the hall hushed.", road: null })).map((entry) => entry.path)).toEqual([]);
      expect(hits(chain({}, { start: "a", road: "b", cache: { text: "c" } }))).toEqual([]);
    });
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

  it("recognizes the runtime's card scope without hiding an unbound orphan", () => {
    const story: StoryV2 = { ...clean,
      qualities: [...clean.qualities, { key: "hair", type: "string", source: "extractor", rubric: "confirmed hair" },
        { key: "orphan", type: "string", source: "extractor", rubric: "unused" }],
      roster: [{ id: "belle", name: "Belle", card: { fields: { hair: { quality: "hair", visual: true } } } }],
    };
    const hits = runDiagnostics(story).filter((entry) => entry.code === "quality-never-in-scope");
    expect(hits).toHaveLength(1);
    expect(hits[0].message).toContain("orphan");
  });

  it("counts a quest's gates as scope (v2.7 36 quest scope source) without hiding a milestone-only orphan", () => {
    const story: StoryV2 = { ...clean,
      qualities: [...clean.qualities, { key: "seen", type: "bool", source: "extractor", rubric: "r" },
        { key: "found", type: "bool", source: "extractor", rubric: "r" },
        { key: "step_done", type: "bool", source: "extractor", rubric: "r" },
        { key: "only_milestone", type: "bool", source: "extractor", rubric: "r" }],
      quests: [{ id: "q", title: "Q", kind: "side", visible_when: { q: "seen", op: "==", v: true }, done_when: { q: "found", op: "==", v: true },
        steps: [{ text: "s", done_when: { q: "step_done", op: "==", v: true } }] }],
      milestones: [{ id: "m", title: "M", when: { q: "only_milestone", op: "==", v: true } }],
    };
    const hits = runDiagnostics(story).filter((entry) => entry.code === "quality-never-in-scope");
    expect(hits.map((entry) => entry.message)).toEqual([expect.stringContaining("only_milestone")]);
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

  it("L5: warns when exclusive lore-select names no lorebook, and not when it names one", () => {
    const empty: StoryV2 = { ...clean, lore_select: { lorebooks: [], exclusive: true } };
    expect(runDiagnostics(empty).filter((entry) => entry.code === "lore-select-exclusive-empty").map((entry) => [entry.severity, entry.path])).toEqual([["warning", "lore_select.exclusive"]]);
    const scoped: StoryV2 = { ...clean, requirements: { lorebooks: ["Vault Lore"] }, lore_select: { lorebooks: ["Vault Lore"], exclusive: true } };
    expect(runDiagnostics(scoped).some((entry) => entry.code === "lore-select-exclusive-empty")).toBe(false);
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

describe("v2.5 plan 01 D: world info rests off under per-chat gating", () => {
  const withWorldInfo: StoryV2 = {
    ...clean,
    checkpoints: [
      { id: "start", name: "Start", objective: "", type: "intermediate", start: true, effects: { world_info: { enable: [{ lorebook: "Ruins", comments: ["CP1", "CP2"] }] } } },
      { id: "cache", name: "Cache", objective: "", type: "anchor", effects: { world_info: { disable: [{ lorebook: "Ruins", comments: ["CP1"] }] } } },
    ],
  };
  const restsOff = (draft: StoryV2, mode?: "file" | "scan") => runDiagnostics(draft, mode ? { worldInfoGating: mode } : {}).filter((entry) => entry.code === "world-info-rests-off");

  it("says the story's gated entries rest off in their lorebooks, once, as info", () => {
    const found = restsOff(withWorldInfo, "scan");
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe("info");
    expect(found[0].message).toContain("2 lorebook entries in Ruins");
  });

  it("control: says nothing in file mode, with no mode given, or for a story with no world info", () => {
    expect(restsOff(withWorldInfo, "file")).toEqual([]);
    expect(restsOff(withWorldInfo)).toEqual([]);
    expect(restsOff(clean, "scan")).toEqual([]);
  });
});

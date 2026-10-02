import type { GateNode, StoryV2, Transition } from "@engine/index";
import { DIAGNOSTIC_CONSEQUENCES, runDiagnostics } from "./diagnostics";

const edge = (from: string, to: string, gate: GateNode): Transition => ({ from, to, gate, priority: 1 });

const kingdom = (transitions: Transition[], patch: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2,
  title: "The Redrawn Kingdom",
  description: "",
  qualities: [
    { key: "map_truth", type: "enum", values: ["asleep", "stirring", "awake"], source: "extractor", rubric: "How awake is the map?" },
    { key: "insight", type: "int", source: "extractor", rubric: "How much does the apprentice understand?" },
    { key: "vael_trust", type: "bool", source: "extractor", rubric: "Does Vael trust the apprentice?" },
  ],
  checkpoints: [
    { id: "start", name: "The Inkwell", objective: "Notice.", type: "anchor", start: true },
    { id: "calder_truth", name: "Calder's Truth", objective: "Learn.", type: "intermediate" },
    { id: "night_redraw", name: "The Night Redraw", objective: "Redraw.", type: "intermediate" },
    { id: "three_pens", name: "Three Pens", objective: "Choose.", type: "anchor" },
  ],
  transitions,
  roster: [{ id: "orin", name: "Master Orin" }],
  ...patch,
});

const passThrough = (story: StoryV2) => runDiagnostics(story).filter((diagnostic) => diagnostic.code === "gate-open-on-arrival");

describe("T5-1-3 MEDIUM: a checkpoint whose way out is already open when the story arrives", () => {
  it("flags the same gate on two consecutive edges (the T5-1-3 shape)", () => {
    const awake: GateNode = { q: "map_truth", op: "==", v: "awake" };
    const found = passThrough(kingdom([edge("start", "calder_truth", { q: "insight", op: ">=", v: 1 }), edge("calder_truth", "night_redraw", awake), edge("night_redraw", "three_pens", awake)]));
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe("transitions.2.gate");
    expect(found[0].severity).toBe("warning");
    expect(found[0].message).toContain("night_redraw");
    expect(found[0].consequence).toBe(DIAGNOSTIC_CONSEQUENCES["gate-open-on-arrival"]);
  });

  it("flags a weaker numeric bound, and an exit implied by one half of an all", () => {
    const weaker = passThrough(kingdom([edge("calder_truth", "night_redraw", { q: "insight", op: ">=", v: 3 }), edge("night_redraw", "three_pens", { q: "insight", op: ">", v: 1 })]));
    expect(weaker).toHaveLength(1);
    const conjunct = passThrough(kingdom([
      edge("calder_truth", "night_redraw", { all: [{ q: "vael_trust", op: "==", v: true }, { q: "insight", op: ">=", v: 2 }] }),
      edge("night_redraw", "three_pens", { q: "vael_trust", op: "==", v: true }),
    ]));
    expect(conjunct).toHaveLength(1);
    const member = passThrough(kingdom([edge("calder_truth", "night_redraw", { q: "map_truth", op: "==", v: "awake" }), edge("night_redraw", "three_pens", { q: "map_truth", op: "in", v: ["stirring", "awake"] })]));
    expect(member).toHaveLength(1);
  });

  it("does not flag a stricter exit, another quality, an any, or a not", () => {
    const awake: GateNode = { q: "map_truth", op: "==", v: "awake" };
    expect(passThrough(kingdom([edge("calder_truth", "night_redraw", { q: "insight", op: ">=", v: 2 }), edge("night_redraw", "three_pens", { q: "insight", op: ">=", v: 3 })]))).toEqual([]);
    expect(passThrough(kingdom([edge("calder_truth", "night_redraw", awake), edge("night_redraw", "three_pens", { q: "vael_trust", op: "==", v: true })]))).toEqual([]);
    expect(passThrough(kingdom([edge("calder_truth", "night_redraw", { any: [awake, { q: "insight", op: ">=", v: 4 }] }), edge("night_redraw", "three_pens", awake)]))).toEqual([]);
    expect(passThrough(kingdom([edge("calder_truth", "night_redraw", awake), edge("night_redraw", "three_pens", { not: { q: "map_truth", op: "==", v: "asleep" } })]))).toEqual([]);
    expect(passThrough(kingdom([edge("calder_truth", "night_redraw", awake), edge("night_redraw", "three_pens", { q: "map_truth", op: "==", v: "stirring" })]))).toEqual([]);
  });

  it("does not flag an exit whose quality the checkpoint resets on arrival", () => {
    const awake: GateNode = { q: "map_truth", op: "==", v: "awake" };
    const story = kingdom([edge("calder_truth", "night_redraw", awake), edge("night_redraw", "three_pens", awake)]);
    story.checkpoints[2] = { ...story.checkpoints[2], state_snapshot: { map_truth: "asleep" } };
    expect(passThrough(story)).toEqual([]);
  });
});

describe("T5-1-4 HIGH: a required persona the install does not have is named", () => {
  const story = kingdom([], { requirements: { personas: ["The Apprentice"] } });

  it("warns with the persona's name and the fix", () => {
    const found = runDiagnostics(story, { personaNames: () => ["Max Nightriver"] }).filter((diagnostic) => diagnostic.code === "requirement-persona-missing");
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe("requirements.personas.0");
    expect(found[0].message).toContain("'The Apprentice'");
    expect(found[0].message).toContain("remove it from Requirements");
    expect(found[0].consequence).toBe(DIAGNOSTIC_CONSEQUENCES["requirement-persona-missing"]);
  });

  it("is silent for an existing persona, and when the install's personas are unknown", () => {
    expect(runDiagnostics(story, { personaNames: () => ["The Apprentice"] }).some((diagnostic) => diagnostic.code === "requirement-persona-missing")).toBe(false);
    expect(runDiagnostics(story).some((diagnostic) => diagnostic.code === "requirement-persona-missing")).toBe(false);
  });
});

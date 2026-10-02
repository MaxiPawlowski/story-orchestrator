import type { GateNode, Quality, StoryV2, Transition } from "@engine/index";
import { DIAGNOSTIC_CONSEQUENCES, runDiagnostics } from "./diagnostics";

const enumQuality = (key: string, values: string[], patch: Partial<Quality> = {}): Quality => ({ key, type: "enum", source: "extractor", rubric: `${key}?`, values, ...patch });

const QUALITIES: Quality[] = [
  enumQuality("map_truth", ["blind", "suspects", "knows", "mastered"]),
  enumQuality("house_pressure", ["unaware", "watched", "courted", "hunted", "besieged"]),
  enumQuality("pen_control", ["house_held", "contested", "apprentice_held", "mastered"]),
  { key: "noise", type: "int", source: "extractor", rubric: "How loud?" },
];

const edge = (from: string, to: string, gate: GateNode): Transition => ({ from, to, priority: 1, gate });

const ids = ["start", "dawn", "offer", "archive", "raid", "choice", "siege"];

const story = (transitions: Transition[], patch: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2,
  title: "The Red Ink",
  description: "",
  qualities: QUALITIES,
  checkpoints: [...new Set([...ids, ...transitions.flatMap((entry) => [entry.from, entry.to])])].map((id, index) => ({
    id, name: id, objective: "Play.", type: "anchor", ...(index === 0 ? { start: true } : {}),
  })),
  transitions,
  roster: [{ id: "master", name: "Master" }],
  ...patch,
});

const RED_INK = (): Transition[] => [
  edge("start", "dawn", { q: "map_truth", op: "!=", v: "blind" }),
  edge("dawn", "offer", { q: "house_pressure", op: "!=", v: "unaware" }),
  edge("offer", "archive", { q: "map_truth", op: "!=", v: "blind" }),
  edge("archive", "raid", { q: "house_pressure", op: "in", v: ["courted", "hunted", "besieged"] }),
  edge("raid", "choice", { q: "pen_control", op: "!=", v: "house_held" }),
  edge("choice", "siege", { q: "pen_control", op: "in", v: ["apprentice_held", "mastered", "contested"] }),
];

const passThrough = (draft: StoryV2) => runDiagnostics(draft).filter((diagnostic) => diagnostic.code === "gate-open-on-arrival");

describe("T6-3-3 HIGH: a way out already open from a value set earlier on the route", () => {
  it("flags offer (its exit was met two edges back) and choice (an enum != that implies the exit's in)", () => {
    const found = passThrough(story(RED_INK()));
    expect(found.map((diagnostic) => diagnostic.path)).toEqual(["transitions.2.gate", "transitions.5.gate"]);
    expect(found[0].message).toContain("'offer'");
    expect(found[0].message).toContain("when the story left 'start'");
    expect(found[1].message).toContain("'choice'");
    expect(found[0].consequence).toBe(DIAGNOSTIC_CONSEQUENCES["gate-open-on-arrival"]);
  });

  it("stays silent on exits the route does not already meet", () => {
    const found = passThrough(story(RED_INK())).map((diagnostic) => diagnostic.path);
    expect(found).not.toContain("transitions.3.gate");
    expect(found).not.toContain("transitions.4.gate");
    expect(found).not.toContain("transitions.1.gate");
  });

  it("is silent when a checkpoint on the way resets the quality", () => {
    const draft = story(RED_INK());
    draft.checkpoints = draft.checkpoints.map((checkpoint) => (checkpoint.id === "dawn" ? { ...checkpoint, state_snapshot: { map_truth: "blind" } } : checkpoint));
    expect(passThrough(draft).map((diagnostic) => diagnostic.path)).not.toContain("transitions.2.gate");
  });

  it("uses the newest value on the route: a later edge replaces what an earlier one required", () => {
    const draft = story([
      edge("start", "dawn", { q: "map_truth", op: "==", v: "suspects" }),
      edge("dawn", "offer", { q: "map_truth", op: "==", v: "knows" }),
      edge("offer", "archive", { q: "house_pressure", op: "==", v: "watched" }),
      edge("archive", "raid", { q: "map_truth", op: "==", v: "suspects" }),
    ]);
    expect(passThrough(draft)).toEqual([]);
  });

  it("carries a free number only across the entering edge, a monotonic one across the route", () => {
    const route = [
      edge("start", "dawn", { q: "noise", op: ">=", v: 3 }),
      edge("dawn", "offer", { q: "map_truth", op: "!=", v: "blind" }),
      edge("offer", "archive", { q: "noise", op: ">=", v: 2 }),
    ];
    expect(passThrough(story(route))).toEqual([]);
    const monotonic = story(route, { qualities: QUALITIES.map((quality) => (quality.key === "noise" ? { ...quality, monotonic: true } : quality)) });
    expect(passThrough(monotonic).map((diagnostic) => diagnostic.path)).toEqual(["transitions.2.gate"]);
  });

  it("flags a checkpoint passed through on one of two routes, naming that route", () => {
    const draft = story([
      edge("start", "dawn", { q: "map_truth", op: "==", v: "knows" }),
      edge("start", "offer", { q: "house_pressure", op: "==", v: "watched" }),
      edge("dawn", "archive", { q: "house_pressure", op: "==", v: "courted" }),
      edge("offer", "archive", { q: "house_pressure", op: "==", v: "courted" }),
      edge("archive", "raid", { q: "map_truth", op: "in", v: ["knows", "mastered"] }),
    ]);
    const found = passThrough(draft);
    expect(found.map((diagnostic) => diagnostic.path)).toEqual(["transitions.4.gate"]);
    expect(found[0].message).toContain("'dawn'");
  });
});
